use std::{sync::Arc, time::Duration};

use core_foundation::{
    base::TCFType,
    mach_port::CFMachPortRef,
    runloop::{CFRunLoop, CFRunLoopRunResult, CFRunLoopSource, kCFRunLoopDefaultMode},
};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    CallbackResult, EventField,
};
use crossbeam_channel::{Receiver, bounded};

use crate::{
    CaptureError,
    cursor::{CaptureRegion, CursorEvent, mac_button_event::mac_button_event},
    session::StartGate,
};

use super::recording::{MacCursorMetrics, coordinate};

pub(super) struct MacButtonCapture {
    tap: CGEventTap<'static>,
    run_loop: CFRunLoop,
    source: CFRunLoopSource,
    events: Receiver<CursorEvent>,
    metrics: Arc<MacCursorMetrics>,
}

impl MacButtonCapture {
    pub(super) fn open(
        region: CaptureRegion,
        start_gate: Arc<StartGate>,
        metrics: Arc<MacCursorMetrics>,
    ) -> Result<Self, CaptureError> {
        if !super::input_access_granted() {
            return Err(CaptureError::PermissionDenied(
                "macOS Input Monitoring is required to record clicks. Enable Beam in System Settings > Privacy & Security > Input Monitoring.".into(),
            ));
        }
        let (sender, events) = bounded(256);
        let callback_metrics = metrics.clone();
        let tap = CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![
                CGEventType::LeftMouseDown,
                CGEventType::LeftMouseUp,
                CGEventType::RightMouseDown,
                CGEventType::RightMouseUp,
                CGEventType::OtherMouseDown,
                CGEventType::OtherMouseUp,
            ],
            move |_, event_type, event| {
                if matches!(
                    event_type,
                    CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput
                ) {
                    callback_metrics
                        .record_input_failure("macOS disabled mouse event capture".into());
                } else if start_gate.is_released() {
                    let location = event.location();
                    let result = start_gate.session_time_ns().and_then(|session_ns| {
                        mac_button_event(
                            event_type as u32,
                            event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER),
                            session_ns,
                            coordinate(location.x),
                            coordinate(location.y),
                            region,
                        )
                    });
                    match result {
                        Ok(Some(button)) => {
                            if sender.try_send(button).is_err() {
                                callback_metrics.record_input_failure(
                                    "macOS mouse event capture queue overflowed or closed".into(),
                                );
                            }
                        }
                        Ok(None) => {}
                        Err(error) => callback_metrics.record_input_failure(error.to_string()),
                    }
                }
                CallbackResult::Keep
            },
        )
        .map_err(|()| {
            CaptureError::Backend("macOS could not create the mouse event listener".into())
        })?;
        // SAFETY: this listener owns the live Mach port. Keep it disabled during preparation.
        unsafe { CGEventTapEnable(tap.mach_port().as_concrete_TypeRef(), false) };
        let source = tap.mach_port().create_runloop_source(0).map_err(|()| {
            CaptureError::Backend("macOS could not create the mouse event run-loop source".into())
        })?;
        let run_loop = CFRunLoop::get_current();
        run_loop.add_source(&source, unsafe { kCFRunLoopDefaultMode });
        Ok(Self {
            tap,
            run_loop,
            source,
            events,
            metrics,
        })
    }

    pub(super) fn start(&self) -> Result<(), CaptureError> {
        self.tap.enable();
        // SAFETY: the event tap owns this Mach port throughout the query.
        if unsafe { CGEventTapIsEnabled(self.tap.mach_port().as_concrete_TypeRef()) } {
            Ok(())
        } else {
            Err(CaptureError::Backend(
                "macOS could not enable mouse event capture".into(),
            ))
        }
    }

    pub(super) fn stop(&self) {
        // SAFETY: the owned Mach port remains valid until this listener is dropped.
        unsafe { CGEventTapEnable(self.tap.mach_port().as_concrete_TypeRef(), false) };
    }

    pub(super) fn poll(&self) {
        // Service every press/release, including pairs shorter than the sampling interval.
        let result = CFRunLoop::run_in_mode(
            unsafe { kCFRunLoopDefaultMode },
            Duration::from_millis(8),
            false,
        );
        if matches!(
            result,
            CFRunLoopRunResult::Finished | CFRunLoopRunResult::Stopped
        ) {
            self.metrics
                .record_input_failure("macOS mouse event run loop stopped".into());
        }
    }

    pub(super) fn events(&self) -> impl Iterator<Item = CursorEvent> + '_ {
        self.events.try_iter()
    }
}

impl Drop for MacButtonCapture {
    fn drop(&mut self) {
        self.stop();
        self.run_loop
            .remove_source(&self.source, unsafe { kCFRunLoopDefaultMode });
    }
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    fn CGEventTapIsEnabled(tap: CFMachPortRef) -> bool;
}
