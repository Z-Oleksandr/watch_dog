use sysinfo::{NetworkExt, NetworksExt, ProcessExt, System, SystemExt};

fn main() {
    let mut sys = System.new_all();

    sys.refresh_all();

    let cpu_rate = sys.global_processor_info().cpu_usage();

    println!("CPU rate: {}", cpu_rate);
}
