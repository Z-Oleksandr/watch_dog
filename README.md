# Watch Dog

This is a system resources monitoring app, developed primarily for headless servers.
The main idea is to be able to see the state of the server's system using any device connected to the local network.

## How to run:

### Prerequisites:

-   You need to have node and npm installed in order to run the front-end of the app.

### Steps:

1. Clone the project.
2. Move to front_panel dir `cd front_panel/`
3. Execute `npm install`
4. Execute `npm run build`
5.  - On Windows: execute `npm run watch_dog_win`
    - On Linux: execute `npm run watch_dog`
6. In browser open `http://localhost:9000`

And that is basically it, **however** that is more of a test run. In order to fulfill the main purpose of the app it has to run in the background on a server (as an example we will take a server running a linux OS) and be accessible at any time from any other device in the local network (it could also be set up to only be accessible from one specific device, but we will save that for later).

1. This step remains the same => clone the project.
2. Choose a process manager, which will allow the app to run in the background, for example pm2 (a process manager for Node.js apps)
3. Execute `npm install -g pm2`
4. Move to front_panel dir `cd front_panel/`
5. Execute `npm install`
6. Execute `npm run build`
7. Start the app `pm2 start npm --name watch_dog -- run watch_dog`
8. If you have firewall enabled, you need to allow access at port 9000 `ufw allow 9000`
9. Now you can access the app from any device in your local network at `http://<server-private-ip>:9000`
10. To have pm2 automatically run on system startup execute: `pm2 startup`

Note: On a linux system you might need to make sure the binary has executable permissions. For example from project root execute: `chmod +x /engine/app_linux/engine`
