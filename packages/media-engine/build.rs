fn main() {
    let plist = concat!(env!("CARGO_MANIFEST_DIR"), "/macos/Info.plist");
    println!("cargo:rerun-if-changed={plist}");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        for argument in [
            "-Xlinker",
            "-sectcreate",
            "-Xlinker",
            "__TEXT",
            "-Xlinker",
            "__info_plist",
            "-Xlinker",
            plist,
        ] {
            println!("cargo:rustc-link-arg-bin=beam-media-engine={argument}");
        }
    }
}
