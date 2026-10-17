
// Dashboard is read-only in terms of generating commands natively, 
// but it might have buttons to trigger specific tests or Stops.

export function triggerEStopFromDashboard(): void {
  // In a real app, this might just call fsm.eStop() directly, 
  // but to keep it strictly in the pipeline we could have a specific system command.
  // We'll leave it simple for the stub.
}
