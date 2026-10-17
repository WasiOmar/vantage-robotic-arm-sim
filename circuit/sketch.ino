/*
 * ============================================================
 * IUT Hackathon — Phase 5 PoC (Continuous Wave Sweep Demo)
 * Updated for ESP32 Arduino Core 3.x LEDC API
 * ============================================================
 */

// Pin mappings matching your diagram.json
const int SERVO_PINS[6] = {13, 14, 16, 17, 25, 26}; 
float currentAngles[6] = {90.0, 90.0, 90.0, 90.0, 90.0, 90.0};

// Forward declaration for the PWM writer function
void writeServoAngle(int pin, float angle);

void setup() {
  Serial.begin(115200);
  Serial.println("\n=============================================");
  Serial.println("     6-DOF SERVO CONTINUOUS WAVE DEMO        ");
  Serial.println("=============================================");
  Serial.println(" Launching automatic synchronized sweep pattern...");

  // New ESP32 Core 3.x API: Pass pin, frequency (50Hz), and resolution (16-bit) directly
  for (int i = 0; i < 6; i++) {
    ledcAttach(SERVO_PINS[i], 50, 16); 
    writeServoAngle(SERVO_PINS[i], currentAngles[i]); // Initialize at 90 degrees
  }
}

void loop() {
  // Uses time (millis) to generate a smooth, infinite math timeline
  float timeFactor = millis() / 1000.0; 

  for (int i = 0; i < 6; i++) {
    // Offset each joint slightly so they move sequentially like a mechanical wave
    float waveOffset = i * 0.4; 
    
    // Automatically calculates a changing target angle between 45° and 135°
    float targetAngle = 90.0 + (sin(timeFactor + waveOffset) * 45.0);
    
    currentAngles[i] = targetAngle;
    writeServoAngle(SERVO_PINS[i], targetAngle);
  }

  delay(15); // Controls the update frame rate/smoothness of the sweep
}

// Converts angle directly to a 16-bit PWM duty cycle (50Hz)
void writeServoAngle(int pin, float angle) {
  // Maps 0-180 degrees to standard 0.5ms-2.5ms servo pulse width timing limits
  uint32_t duty = (((angle / 180.0) * 2000.0) + 500.0) / 20000.0 * 65535.0;
  
  // New ESP32 Core 3.x API: Write directly to the GPIO pin instead of a channel
  ledcWrite(pin, duty);
}