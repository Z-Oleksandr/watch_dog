pub struct DemoSystem {
    loop_counter: u32,
    system_name: String,
    kernel_version: String,
    cpu_arch: String,
    os_version: String,
    host_name: String,
    uptime: u64,
    num_cpus: usize,
    num_disks: u32,
    disks_space: Vec<u64>,
    disks_used_space: Vec<u64>,
    ram_total: u64,
    ram_used: u64,
    network_received: u64,
    network_transmitted: u64,
}

impl DemoSystem {
    pub fn cpu_usage() -> Vec<f32> {
        let mut cpu_usage = Vec::new();
        if self.loop_counter % 2 == 0 || self.loop_counter == 0 {
            cpu_usage = cpu_usage
            .iter()
            .map(|usage| (usage * rng.gen_range(0.5..=1.5)).min(100.0))
            .collect();
        }
    }
}

let disks_used_space: Vec<u64> = (0..3)
        .map(|_| rng.gen_range(0..250))
        .collect();

for _i in 0..3 {
    disks_space.push(rng.gen_range(250..=3000));
    disk_count += 1;
}

let ram_total = rng.gen_range(1..=8) * 4;


let system_name = "Demo system".to_string();

let kernel_version = "4.20.69".to_string();

let cpu_arch = "Demo system arch".to_string();

let os_version = "12345.77".to_string();

let host_name = "seraphim".to_string();

let mut uptime: u64 = 123456789;

let mut loop_counter = 0;

let mut cpu_usage: Vec<f32> = vec![15.0, 16.0, 17.0, 18.0];
let ram_total_MB = (ram_total * 1000) as f64;
let mut ram_used = (ram_total_MB * 0.42);
let mut network_received = 0;
let mut network_transmitted = 0;

loop {
    if loop_counter % 2 == 0 || loop_counter == 0 {
        ram_used = (ram_used * rng.gen_range(0.5..=1.5)).min(ram_total_MB);
    }

    network_received = 0;
    network_transmitted = 0;
    if loop_counter % 10 == 0 {
        network_received += rng.gen_range(0..900000);
        network_transmitted += rng.gen_range(0..900000);
    }

    uptime += 1;

    let stats = SystemStats {
        data_type: 1,
        cpu_usage: cpu_usage.clone(),
        ram_total,
        ram_used: ram_used as u64,
        disks_used_space: disks_used_space.clone(),
        network_received,
        network_transmitted,
        uptime
    };

    let stats_json = serde_json::to_string(&stats).unwrap();

    if let Err(e) = write.send(Message::Text(stats_json)).await {
        eprintln!("Error sending stats: {}", e);
        break;
    }

    loop_counter += 1;
    time::sleep(Duration::from_secs(1)).await;
}