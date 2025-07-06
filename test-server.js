// Simple test to check if server starts without errors
console.log('Testing server startup...');

try {
    require('./server.js');
    console.log('✅ Server loaded successfully');
} catch (error) {
    console.error('❌ Server failed to load:', error.message);
    process.exit(1);
}
