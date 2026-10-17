# Vantage Robotics - 6 DOF Robotic Arm Control

This project features a fully functional browser-based simulation for a 6 Degree-of-Freedom (DOF) robotic arm. The arm can be controlled via Keyboard, Mouse, Gamepad, and Voice.

## How to Run
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

## Control Mappings

### 1. Keyboard Control (6-DOF)
To use the keyboard, ensure **Keyboard** mode is selected from the MENU in the top left.

#### Cartesian Translation (XYZ)
* **W / S**: Move along Y-axis (Forward / Backward)
* **A / D**: Move along X-axis (Left / Right)
* **Space / Shift**: Move along Z-axis (Up / Down)

#### Joint Rotation (1-6)
Control individual joints directly. Press the number key to rotate positively. Hold **Shift** + number key to rotate negatively.
* **1 / Shift+1**: Rotate Joint 1 (Base)
* **2 / Shift+2**: Rotate Joint 2 (Shoulder)
* **3 / Shift+3**: Rotate Joint 3 (Elbow)
* **4 / Shift+4**: Rotate Joint 4 (Wrist Pitch)
* **5 / Shift+5**: Rotate Joint 5 (Wrist Yaw)
* **6 / Shift+6**: Rotate Joint 6 (Wrist Roll)

### 2. Mouse Control
Ensure **Mouse Control** mode is selected.
* **Left Click + Drag**: Translate the arm in the X/Y plane.
* **Scroll Wheel**: Translate the arm along the Z-axis (up and down).

### 3. Joystick / Gamepad Control
Ensure **Joystick** mode is selected.
* **Virtual Joystick**: Drag the on-screen joystick to move in X/Y. Use the vertical slider for Z.
* **Physical Gamepad**: Plug in an Xbox or PlayStation controller.
    * **Left Stick (X/Y)**: Moves the arm in the X/Y plane.
    * **Right Stick (Y)**: Moves the arm along the Z-axis.

### 4. Voice Control
Ensure **Voice Control** mode is selected.
* Tap the microphone button and speak commands like: "move up", "go left", "forward", etc.

### 5. Auto / PIN Mode (IK Target)
Ensure **Auto / PIN** mode is selected.
* Enter absolute Cartesian coordinates (X, Y, Z) and click Execute to move via Inverse Kinematics.

## Manual Testing Guide
1. Launch the app (`npm run dev`).
2. Switch to **Keyboard** mode and try W,A,S,D. Then try pressing 1-6 with and without Shift to see individual joints rotate.
3. Plug in a controller, switch to **Joystick** mode, and move the sticks. (You may need to press a button on the controller first to wake it up in the browser).
4. Switch to **Mouse** mode and drag on the 3D canvas.
5. Check the Audit Log in the bottom left to see the commands being accepted by the Command Bus and executed safely.
