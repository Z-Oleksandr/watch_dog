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

class ContainerStreamRegister {
    // Keeps track of which container is streamed over which channel
    // Channels are the count number twice
    constructor() {
        this.count = 0;
        this.channels = Object.create(null);
        this.list = {};
    }
}

let container_stream_register = new ContainerStreamRegister();

export function start_container_stdout() {
    display.write_line("Getting containers list...");
    sendWSMessage("get_containers", 0);
}

export function handle_received_container_list(list) {
    Object.entries(list).forEach(([index, containerName]) => {
        display.write_line(`${index}: ${containerName}`);
    });
    container_stream_register.list = list;
    const limit = Object.keys(list).length - 1;
    setTimeout(() => {
        display.write_line("Choose container to stream output:");
        display.pending_choice("Container: 0", false);
        let containerOutputRequest = new ContainerOutputRequest(
            "start_container_output",
            0
        );
        buttonsDocker(containerOutputRequest, limit, list);
    }, 500);
}

function buttonsDocker(containerOutputRequest, limit, list) {
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
            const message = construct_container_stream_message(
                containerOutputRequest.index
            );
            sendWSMessage(containerOutputRequest.type, message);
            display.write_line(
                "Sending request: " +
                    containerOutputRequest.type +
                    " " +
                    message
            );
            init_functions();
        },
        "select"
    );
}

export function get_container_stream_register() {
    return container_stream_register;
}

function construct_container_stream_message(container_index) {
    const channel = container_index.toString().repeat(2);
    if (!(channel in container_stream_register.channels)) {
        container_stream_register.count += 1;
        container_stream_register.channels[container_index] = channel;
    }
    console.log(`Message before: ${container_index}99899${channel}`);

    const message = Number(`${container_index}99899${channel}`);
    console.log("Message: " + message);
    return message;
}
