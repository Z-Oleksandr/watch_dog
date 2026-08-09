use serde::Serialize;
use sysinfo::Components;

const MIN_PLAUSIBLE_C: f32 = 0.0;
const MAX_PLAUSIBLE_C: f32 = 130.0;

// Calibration/reference sensors report constants, not component temperatures
const MEANINGLESS_LABEL_PARTS: [&str; 2] = ["tcal", "calibration"];

fn is_meaningless_label(label: &str) -> bool {
    let lower = label.to_lowercase();
    MEANINGLESS_LABEL_PARTS
        .iter()
        .any(|part| lower.contains(part))
}

fn is_plausible_temperature(temperature: f32) -> bool {
    temperature.is_finite() && temperature > MIN_PLAUSIBLE_C && temperature < MAX_PLAUSIBLE_C
}

/// Whether a sensor is worth showing on the panel.
fn is_usable_sensor(label: &str, temperature: f32) -> bool {
    is_plausible_temperature(temperature) && !is_meaningless_label(label)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct TempSensor {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub critical: Option<f32>,
}

/// The sensors reported to the front-end, and where to find them in the
/// `Components` list they were discovered in.
///
/// `indices` are positions in that specific list. sysinfo enumerates
/// `/sys/class/hwmon` in directory order, which is not stable across calls, so
/// readings must always come from the same `Components` instance this registry
/// was built from.
pub struct TempSensorRegistry {
    pub sensors: Vec<TempSensor>,
    indices: Vec<usize>,
}

pub fn init_temp_sensors(components: &Components) -> TempSensorRegistry {
    let mut sensors = Vec::new();
    let mut indices = Vec::new();

    for (index, component) in components.iter().enumerate() {
        if !is_usable_sensor(component.label(), component.temperature()) {
            continue;
        }
        sensors.push(TempSensor {
            label: component.label().to_string(),
            critical: component.critical(),
        });
        indices.push(index);
    }

    TempSensorRegistry { sensors, indices }
}

/// Reads the registered sensors.
///
/// Performs blocking sysfs reads; an NVMe sensor costs roughly 12 ms because
/// the kernel queries the drive, so this must run on the blocking pool and off
/// the once-per-second path.
pub fn read_temperatures(components: &mut Components, registry: &TempSensorRegistry) -> Vec<f32> {
    if registry.indices.is_empty() {
        return Vec::new();
    }

    components.refresh();
    let list = components.list();

    registry
        .indices
        .iter()
        .map(|&index| match list.get(index) {
            Some(component) => {
                let temperature = component.temperature();
                if temperature.is_finite() {
                    temperature
                } else {
                    0.0
                }
            }
            None => 0.0,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_calibration_sensors() {
        assert!(is_meaningless_label("Tcal"));
        assert!(is_meaningless_label("nvme calibration"));
        assert!(!is_meaningless_label("k10temp Tctl"));
    }

    #[test]
    fn rejects_implausible_readings() {
        assert!(!is_plausible_temperature(f32::NAN));
        assert!(!is_plausible_temperature(f32::INFINITY));
        assert!(!is_plausible_temperature(0.0));
        assert!(!is_plausible_temperature(-5.0));
        assert!(!is_plausible_temperature(130.0));
        assert!(!is_plausible_temperature(200.0));
    }

    #[test]
    fn accepts_ordinary_readings() {
        assert!(is_plausible_temperature(0.1));
        assert!(is_plausible_temperature(44.9));
        assert!(is_plausible_temperature(129.9));
    }

    #[test]
    fn a_usable_sensor_needs_both_a_real_reading_and_a_real_label() {
        assert!(is_usable_sensor("amdgpu edge", 39.0));
        assert!(!is_usable_sensor("Tcal", 39.0));
        assert!(!is_usable_sensor("amdgpu edge", 0.0));
    }

    #[test]
    fn an_empty_registry_reads_nothing() {
        let registry = TempSensorRegistry {
            sensors: Vec::new(),
            indices: Vec::new(),
        };
        let mut components = Components::new();
        assert!(read_temperatures(&mut components, &registry).is_empty());
    }
}
