# Robotic Arm Safety Features Demo

## The Math
Before any physical movement occurs, the proposed joint angles are passed into our Forward Kinematics (FK) solver, which computes the precise 3D spatial coordinates `(X, Y, Z)` of the stylus tip and other key joints using the known segment lengths. If these calculated future positions violate any physical boundaries (like the floor or the base cylinder), the command is immediately rejected by the validation layer before it can reach the executor.

## Demo 1: Anti-Ground Collision (Z-Axis)
1. In the Control Dashboard, ensure the arm is active and you are in Joystick or Keyboard mode.
2. Drive the stylus straight down towards the floor (negative Z direction).
3. As the stylus (or elbow) approaches the `Z = 0.05m` threshold, the movement will halt.
4. **Expected Result**: Look at the Audit Log in the UI. You will see a rejected command with the error message: 
   *"Safety System Triggered: Prevented stylus from colliding with the floor (Z-Axis restriction)."*

## Demo 2: Anti-Self Collision
1. From a safe position, begin to drive the stylus back towards the physical center base of the robot.
2. The safety system defines a protective bounding cylinder (radius 10cm, up to height 35cm) around the base.
3. Keep driving the stylus inward until it attempts to breach this zone.
4. **Expected Result**: The arm will stop moving and the Audit Log will display:
   *"Safety System Triggered: Prevented self-collision (Stylus entering Base bounding box)."*
