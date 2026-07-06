use serde::Serialize;
use sysinfo::Components;

const MIN_PLAUSIBLE_C: f32 = 0.0;
const MAX_PLAUSIBLE_C: f32 = 130.0;

#[derive(Serialize, Clone)]
pub struct TempSensor {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub critical: Option<f32>,
}

pub struct TempSensorRegistry {
    pub sensors: Vec<TempSensor>,
    indices: Vec<usize>,
}

pub fn init_temp_sensors(components: &Components) -> TempSensorRegistry {
    let mut sensors = Vec::new();
    let mut indices = Vec::new();

    for (index, component) in components.iter().enumerate() {
        let temperature = component.temperature();
        if !temperature.is_finite()
            || temperature <= MIN_PLAUSIBLE_C
            || temperature >= MAX_PLAUSIBLE_C
        {
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

pub fn read_temperatures(
    components: &mut Components,
    registry: &TempSensorRegistry
) -> Vec<f32> {
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
                if temperature.is_finite() { temperature } else { 0.0 }
            }
            None => 0.0,
        })
        .collect()
}
