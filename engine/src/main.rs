use std::collections::HashMap;
use sysinfo::{NetworkData, Networks, Process, System, Components, Disks};

fn main() {
    let mut sys = System::new_all();

    sys.refresh_all();

    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();

    let mut sys_info = HashMap::from([
        ("name", System::name()),
        ("kernel", System::kernel_version()),
        ("os", System::os_version()),
        ("host", System::host_name()),
        ("nb_cpu", Some(sys.cpus().len().to_string())),
    ]);

    // Display all disk info:
    println!("=> disks:");
    let disks = Disks::new_with_refreshed_list();
    for disk in &disks {
        println!("{disk:?}");
    }

    // Network interface name, total data received and transmitted:
    println!("=> networks:");
    let networks = Networks::new_with_refreshed_list();
    for (interface_name, data) in &networks {
        println!(
            "{interface_name}: {} B (down) / {} B (up)",
            data.total_received(),
            data.total_transmitted(),
        );
    }

    // Components temp:
    let components = Components::new_with_refreshed_list();
    println!("=> components:");
    for component in &components {
        println!("{component:?}");
    }

    // CPU usage:
    loop {
        sys.refresh_cpu_all();
        for cpu in sys.cpus() {
            println!("{}%", cpu.cpu_usage());
        }

        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    }
}
