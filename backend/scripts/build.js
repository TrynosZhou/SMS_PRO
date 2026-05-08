const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');

// Find TypeScript compiler - try multiple possible locations
const possiblePaths = [
  path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(projectRoot, 'node_modules', '.bin', 'tsc'),
];

let tscPath = null;
for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    tscPath = possiblePath;
    break;
  }
}

// If not found, try to use npm exec
if (!tscPath) {
  console.log('⚠️ TypeScript not found in node_modules, trying npm exec...');
  try {
    execSync('npm exec -- tsc', {
      stdio: 'inherit',
      cwd: projectRoot,
      env: { ...process.env, PATH: process.env.PATH }
    });
    console.log('✅ Build completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ TypeScript not found. Please ensure TypeScript is installed:');
    console.error('   npm install typescript');
    process.exit(1);
  }
}

// Use the found TypeScript compiler
try {
  console.log('🔨 Building TypeScript...');
  execSync(`node "${tscPath}"`, { 
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, PATH: process.env.PATH }
  });
  console.log('✅ Build completed successfully!');
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}

