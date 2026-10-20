/**
 * A cluster-styled placard for a section with nothing to show yet ("awaiting
 * connection", "sensors not available"). Text is set with `textContent`.
 * @param {HTMLElement} container
 * @param {string} title
 * @param {string} message
 * @returns {HTMLElement} The placard, for removal on teardown.
 */
export function buildUnavailableSection(container, title, message) {
    const root = document.createElement("section");
    root.className = "deco-cluster";
    const header = document.createElement("header");
    header.className = "cluster-header";
    const chevronL = document.createElement("span");
    chevronL.className = "cluster-chevrons";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const chevronR = document.createElement("span");
    chevronR.className = "cluster-chevrons";
    header.append(chevronL, heading, chevronR);
    const note = document.createElement("p");
    note.className = "cluster-unavailable";
    const noteText = document.createElement("span");
    noteText.textContent = message;
    note.appendChild(noteText);
    root.append(header, note);
    container.appendChild(root);
    return root;
}
