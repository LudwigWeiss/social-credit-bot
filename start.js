#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if .env file exists
if (!fs.existsSync('.env')) {
    console.error('❌ Error: .env file not found!');
    console.log('📝 Please copy .env.example to .env and fill in your credentials:');
    console.log('   cp .env.example .env');
    console.log('');
    console.log('Required environment variables:');
    console.log('   - DISCORD_TOKEN');
    console.log('   - DISCORD_CLIENT_ID');
    console.log('   - MISTRAL_API_KEY');
    console.log('   - MONGODB_URI');
    process.exit(1);
}

// Check if dist folder exists
if (!fs.existsSync('dist')) {
    console.log('🔨 Building project...');
    const buildProcess = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
    
    buildProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('❌ Build failed!');
            process.exit(1);
        }
        startBot();
    });
} else {
    startBot();
}

function startBot() {
    console.log('🚀 Starting Discord Social Credit Bot...');
    console.log('🇨🇳 Glory to the CCP! Xi Jinping Thought guides us! 🌟');
    console.log('');
    
    const botProcess = spawn('node', ['dist/index.js'], { stdio: 'inherit' });
    
    botProcess.on('close', (code) => {
        console.log(`\n🛑 Bot process exited with code ${code}`);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        botProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        botProcess.kill('SIGTERM');
    });
}