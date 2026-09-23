"""Installed package provenance and notices for RPM and Debian runtime builders."""
from pathlib import Path
import shutil
import subprocess


def command(*args: str) -> str:
    return subprocess.run(args, text=True, capture_output=True, check=True).stdout.strip()


def package_manager() -> str:
    # Ubuntu runners may also install rpm to inspect release artifacts.
    return "dpkg" if Path("/var/lib/dpkg/status").is_file() else "rpm"


def package_metadata(source: Path) -> dict[str, str]:
    if package_manager() == "rpm":
        fields = command("rpm", "-qf", "--queryformat", "%{NAME}\t%{VERSION}-%{RELEASE}\t%{LICENSE}", str(source)).split("\t")
        if len(fields) != 3:
            raise RuntimeError(f"no RPM license metadata for {source}")
        return dict(zip(("package", "package_version", "package_license"), fields))
    # Resolve merged-/usr aliases, which dpkg's ownership database may not use.
    candidates = [source]
    if str(source).startswith("/usr/lib/"):
        candidates.append(Path(str(source)[4:]))
    owner = None
    for candidate in candidates:
        try:
            owner = command("dpkg-query", "-S", str(candidate)).splitlines()[0].rsplit(": ", 1)[0]
            break
        except subprocess.CalledProcessError:
            continue
    if not owner:
        raise RuntimeError(f"no Debian package metadata for {source}")
    notice = Path("/usr/share/doc") / owner.split(":", 1)[0] / "copyright"
    if not notice.is_file():
        raise RuntimeError(f"missing Debian copyright notice for {owner}")
    licenses = sorted({line.removeprefix("License:").strip() for line in notice.read_text(errors="replace").splitlines() if line.startswith("License:")})
    return {"package": owner, "package_version": command("dpkg-query", "-W", "-f=${Version}", owner),
            "package_license": "; ".join(licenses) or "See bundled Debian copyright notice"}


def copy_licenses(packages: set[str], root: Path) -> list[str]:
    missing = []
    for package in sorted(packages):
        if package_manager() == "rpm":
            sources = [Path(line) for line in command("rpm", "-ql", package).splitlines() if "/share/licenses/" in line]
            base = Path("/usr/share/licenses")
        else:
            base = Path("/usr/share/doc")
            sources = [base / package.split(":", 1)[0] / "copyright"]
        copied = 0
        for source in sources:
            if source.is_file():
                destination = root / "licenses" / source.relative_to(base)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                copied += 1
        if not copied:
            missing.append(package)
    # Debian copyright notices can refer to these shared full license texts.
    common = Path("/usr/share/common-licenses")
    if package_manager() == "dpkg" and common.is_dir():
        shutil.copytree(common, root / "licenses/common-licenses", dirs_exist_ok=True)
    return missing


def plugin_scanner() -> Path:
    directory = command("pkg-config", "--variable=pluginscannerdir", "gstreamer-1.0")
    if not directory:
        raise RuntimeError("GStreamer pkg-config did not identify its plugin scanner")
    return (Path(directory) / "gst-plugin-scanner").resolve(strict=True)
