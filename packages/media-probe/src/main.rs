mod args;
mod devices;
mod preview;
mod record;
mod report;
mod resources;

fn main() {
    if let Err(error) = run() {
        eprintln!("beam-media-probe: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = std::env::args().skip(1);
    match arguments.next().as_deref() {
        Some("devices") => {
            args::no_extra_arguments(arguments)?;
            devices::run()
        }
        Some("record") => record::run(args::RecordArgs::parse(arguments)?),
        Some("report") => report::run(args::ReportArgs::parse(arguments)?),
        Some("--help" | "-h" | "help") => {
            args::no_extra_arguments(arguments)?;
            print!("{}", args::USAGE);
            Ok(())
        }
        _ => Err(format!("expected devices, record or report\n{}", args::USAGE).into()),
    }
}
