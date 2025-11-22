// Simplified preinstall: no-op to avoid scanning user directories that cause EPERM on some systems
// Leave this file for small project-specific preinstall tasks in future.
try {
  // no-op
} catch (err) {
  // ignore
}
