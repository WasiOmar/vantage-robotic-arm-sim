import { executeUtterance } from './voice/runUtterance';

export async function handleVoiceCommand(spokenText: string): Promise<void> {
  await executeUtterance(spokenText, 'voice');
}
