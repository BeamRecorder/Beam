fn main() {
    #[cfg(target_os = "macos")]
    {
        // Swift runtime libraries shipped with macOS.
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

        // Support both a standalone binary and the packaged Beam.app layout.
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    }
}
