export function formatSecondsToTime(seconds_input) {
    const dateObj = new Date(seconds_input * 1000);
    const days = Math.floor(seconds_input / (24 * 3600));
    const hours = dateObj.getUTCHours().toString().padStart(2, "0");
    const minutes = dateObj.getUTCMinutes().toString().padStart(2, "0");
    const seconds = dateObj.getUTCSeconds().toString().padStart(2, "0");
    return `${days} days, ${hours}:${minutes}:${seconds} hours`;
}
