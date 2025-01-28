use which::which;

pub fn init_docker_mon() -> bool {
    which("docker").is_ok()
}