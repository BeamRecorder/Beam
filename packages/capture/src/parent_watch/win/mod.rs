use std::{
    ffi::c_void,
    mem::size_of,
    sync::atomic::{AtomicBool, Ordering},
};

use windows::Win32::{
    Foundation::{CloseHandle, FILETIME, HANDLE, WAIT_FAILED, WAIT_OBJECT_0},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        },
        Threading::{
            GetCurrentProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE, TerminateProcess, WaitForSingleObject,
        },
    },
};
use windows::core::PCWSTR;

use super::{FORCED_EXIT_DEADLINE_MS, parent_pid_from_env};
use crate::CaptureError;

static PARENT_DIED: AtomicBool = AtomicBool::new(false);

#[must_use]
pub(super) fn parent_died() -> bool {
    PARENT_DIED.load(Ordering::SeqCst)
}

pub(super) fn install() -> Result<(), CaptureError> {
    let Some(parent_pid) = parent_pid_from_env() else {
        return Ok(());
    };
    let job = create_kill_on_close_job()?;
    let parent = unsafe {
        OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            parent_pid,
        )
    }
    .map_err(|_| {
        close(job);
        CaptureError::parent_death_unavailable("failed to open the owning Electron process")
    })?;
    let current = unsafe { GetCurrentProcess() };
    if creation_time(parent)
        .ok()
        .zip(creation_time(current).ok())
        .is_none_or(|(parent_created, engine_created)| parent_created >= engine_created)
    {
        close(parent);
        close(job);
        return Err(CaptureError::parent_death_unavailable(
            "the Electron parent identity could not be verified",
        ));
    }
    let parent_raw = parent.0 as usize;
    std::thread::Builder::new()
        .name("capture-parent-watchdog".to_owned())
        .spawn(move || {
            let parent = HANDLE(parent_raw as *mut c_void);
            let result = unsafe { WaitForSingleObject(parent, u32::MAX) };
            let _ = unsafe { CloseHandle(parent) };
            if result == WAIT_OBJECT_0 {
                PARENT_DIED.store(true, Ordering::SeqCst);
                std::thread::sleep(std::time::Duration::from_millis(FORCED_EXIT_DEADLINE_MS));
                let _ = unsafe { TerminateProcess(GetCurrentProcess(), 1) };
            } else if result == WAIT_FAILED {
                let _ = unsafe { TerminateProcess(GetCurrentProcess(), 1) };
            }
        })
        .map_err(|_| {
            close(parent);
            close(job);
            CaptureError::parent_death_unavailable("failed to spawn the watchdog thread")
        })?;

    // Intentionally retain this handle for the lifetime of the engine.
    // Windows closes it on every exit path, killing every process assigned
    // to the job even when Electron terminates the engine abruptly.
    // `HANDLE` has no Rust destructor; leaving scope deliberately keeps the
    // kernel handle open until process teardown.
    let _job_lifetime = job;
    Ok(())
}

fn create_kill_on_close_job() -> Result<HANDLE, CaptureError> {
    let job = unsafe { CreateJobObjectW(None, PCWSTR::null()) }.map_err(|_| {
        CaptureError::parent_death_unavailable("failed to create the capture Job Object")
    })?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const c_void,
            u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>()).unwrap_or(u32::MAX),
        )
    };
    if configured.is_err() || unsafe { AssignProcessToJobObject(job, GetCurrentProcess()) }.is_err()
    {
        close(job);
        return Err(CaptureError::parent_death_unavailable(
            "failed to configure the capture Job Object",
        ));
    }
    Ok(job)
}

fn close(handle: HANDLE) {
    let _ = unsafe { CloseHandle(handle) };
}

fn creation_time(handle: HANDLE) -> windows::core::Result<u64> {
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) }?;
    Ok((u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime))
}
