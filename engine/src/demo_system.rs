use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};
use rand::Rng;
use std::sync::{Arc, Mutex, OnceLock};

pub struct DemoSystem {
    rng: ChaCha20Rng,
    pub system_name: String,
    pub kernel_version: String,
    pub cpu_arch: String,
    pub os_version: String,
    pub host_name: String,
    pub uptime: u64,
    num_cpus: usize,
    num_disks: u32,
    disks_total_space: Vec<u64>,
    disks_used_space: Vec<u64>,
    total_memory: u64,
    cpu_usage_store: Vec<f32>,
    net_store: Vec<u64>
}

pub static DEMO_SYSTEM: OnceLock<Arc<Mutex<DemoSystem>>> = OnceLock::new();

pub fn init_demo_system() {
    DEMO_SYSTEM.set(Arc::new(Mutex::new(DemoSystem::new()))).ok();
}

pub fn get_demo_system() -> Arc<Mutex<DemoSystem>> {
    DEMO_SYSTEM.get().expect("DemoSystem not initialized").clone()
}

impl DemoSystem {
    pub fn new() -> Self {
        let mut rng = ChaCha20Rng::from_entropy();
        let disks_total_space = vec![
            rng.gen_range(250..=3000),
            rng.gen_range(250..=3000),
            rng.gen_range(250..=3000)
        ];
        let disks_used_space = {
            disks_total_space
                .iter()
                .map(|&total| rng.gen_range(100..total) * 1000)
                .collect()
        };


        Self {
            rng: rng.clone(),
            system_name: "Demo system".to_string(),
            kernel_version: "4.20.69".to_string(),
            cpu_arch: "Demo system arch".to_string(),
            os_version: "12345.77".to_string(),
            host_name: "seraphim".to_string(),
            uptime: 123456789,
            num_cpus: 4,
            num_disks: 3,
            total_memory: 16_000_000_000,
            disks_total_space,
            disks_used_space,
            cpu_usage_store: vec![0.0, 0.0, 0.0, 0.0],
            net_store: vec![0, 0]
        }
    }

    pub fn num_cpus(&self) -> usize {
        self.num_cpus
    } 

    pub fn cpu_usage(&mut self, loop_counter: &u64) -> Vec<f32> {
        if *loop_counter % 3 == 0 || *loop_counter == 0 {
            let cpu_usage_store: Vec<f32> = (0..self.num_cpus)
            .map(|_| {
                let usage: f32 = 
                    self.rng.gen_range(0.0..=100.0) * self.rng.gen_range(0.5..=1.5);
                usage.min(100.0)
            })
            .collect();

            self.cpu_usage_store = cpu_usage_store.clone();

            cpu_usage_store
        } else {
            self.cpu_usage_store.clone()
                .iter()
                .map(|value| {
                    value * 0.88
                })
                .collect()
        }
    }

    pub fn total_memory(&self) -> u64 {
        self.total_memory
    }

    pub fn used_memory(&self) -> u64 {
        (self.total_memory / 4) + 1_696_969_690
    }

    pub fn num_disks(&self) -> u32 {
        self.num_disks
    }

    pub fn disks_total_space(&self) -> Vec<u64> {
        self.disks_total_space.clone()
    }

    pub fn disks_used_space(&self) -> Vec<u64> {
        self.disks_used_space.clone()
    }

    pub fn data_received(&mut self, loop_counter: &u64) -> u64 {
        if *loop_counter % 20 == 0 {
            let value = self.rng.gen_range(0..900_000_000);
            self.net_store[0] = value;
            value
        } else if *loop_counter % 21 == 0 || *loop_counter % 22 == 0 {
            self.net_store[0]
        } else {
            0
        }
    }

    pub fn data_transmitted(&mut self, loop_counter: &u64) -> u64 {
        if *loop_counter % 16 == 0 {
            let value = self.rng.gen_range(0..900_000_000);
            self.net_store[1] = value;
            value
        } else if *loop_counter % 16 == 0 || *loop_counter % 17 == 0 {
            self.net_store[1]
        } else {
            0
        }
    }
}
