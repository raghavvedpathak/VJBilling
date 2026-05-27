// Returns current time as ISO-8601 string. Centralized so tests can mock it.
export function now(): string { 
  return new Date().toISOString(); 
}