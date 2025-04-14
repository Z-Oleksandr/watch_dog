import { getDisplay2 } from "../dsiplay2/display2";
import { new_assign_button } from "../button_functions/button_functions";
import { sendWSMessage } from "../script";
import { init_functions } from "./init_functions";

const display = getDisplay2();

class ContainerOutputRequest {
    constructor(type, index) {
        this.type = type;
        this.index = index;
    }
}

export function start_container_stdout() {
    display.write_line("Getting containers list...");
    sendWSMessage("get_containers", 0);
}

export function handle_received_container_list(list) {
    Object.entries(list).forEach(([index, containerName]) => {
        display.write_line(`${index}: ${containerName}`);
    });
    const limit = Object.keys(list).length - 1;
    setTimeout(() => {
        display.write_line("Choose container to stream output:");
        display.pending_choice("Container: 0", false);
        let containerOutputRequest = new ContainerOutputRequest(
            "start_container_output",
            0
        );
        buttonsDocker(containerOutputRequest, limit);
    }, 500);
}

function buttonsDocker(containerOutputRequest, limit) {
    new_assign_button(
        0,
        () => {
            if (containerOutputRequest.index < limit) {
                let count = containerOutputRequest.index + 1;
                containerOutputRequest.index = count;
                display.pending_choice(`Container: ${count}`, false);
            }
        },
        "+"
    );
    new_assign_button(
        1,
        () => {
            if (containerOutputRequest.index > 0) {
                let count = containerOutputRequest.index - 1;
                containerOutputRequest.index = count;
                display.pending_choice(`Container: ${count}`, false);
            }
        },
        "-"
    );
    new_assign_button(
        2,
        () => {
            display.pending_choice(
                `Container ${containerOutputRequest.index} selected`,
                true
            );
            display.write_line(
                "Sending request: " +
                    containerOutputRequest.type +
                    " " +
                    containerOutputRequest.index
            );
            sendWSMessage(
                containerOutputRequest.type,
                containerOutputRequest.index
            );
            init_functions();
        },
        "select"
    );
}
