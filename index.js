#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import readline from 'readline';

// 🔥 Node 22 WebSocket Bug Fix (এটি ইনফিনিট লুপ ক্র্যাশ বন্ধ করবে)
import WebSocket from 'ws';
global.WebSocket = WebSocket;

// Puter.js এর Node.js Auth মডিউল ইমপোর্ট
import { init, getAuthToken } from "@heyputer/puter.js/src/init.cjs";

// টার্মিনালে ইনপুট নেওয়ার জন্য Setup
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const currentDir = process.cwd();

// প্রম্পট নেওয়ার ফাংশন
const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// 🎨 Custom Spinner for Live UI (No extra dependencies needed)
class TerminalSpinner {
    constructor(message) {
        this.message = message;
        this.frames =['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = null;
        this.currentFrame = 0;
    }
    start() {
        this.interval = setInterval(() => {
            process.stdout.write(`\r\x1b[K${chalk.cyan(this.frames[this.currentFrame])} ${chalk.yellow(this.message)}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }
    update(newMessage) {
        this.message = newMessage;
    }
    stop(finalMessage, isSuccess = true) {
        clearInterval(this.interval);
        const icon = isSuccess ? chalk.green('✔') : chalk.red('✖');
        process.stdout.write(`\r\x1b[K${icon} ${isSuccess ? chalk.green(finalMessage) : chalk.red(finalMessage)}\n`);
    }
}

// ⌨️ Live Typing Effect Function
const typeText = async (text, speed = 15) => {
    for (const char of text) {
        process.stdout.write(chalk.cyan(char));
        await new Promise(r => setTimeout(r, speed));
    }
    console.log('\n');
};

async function getProjectContext() {
    const files = await glob('**/*.{js,jsx,css,html}', { ignore: 'node_modules/**' });
    let context = `Project Directory: ${currentDir}\n\nCurrent Files:\n${files.join('\n')}\n\n`;
    
    for (const file of files) {
        const fullPath = path.join(currentDir, file);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            context += `\n--- File: ${file} ---\n${content}\n`;
        }
    }
    return context;
}

async function startInteractiveChat() {
    console.log(chalk.blue.bold('\n=================================================='));
    console.log(chalk.blue.bold('        🤖 Nahid AI Agent (Puter.js Powered)       '));
    console.log(chalk.blue.bold('==================================================\n'));

    const authSpinner = new TerminalSpinner('Connecting to Puter.js server... (A browser pop-up may open)');
    authSpinner.start();
    
    let puter;
    try {
        const authToken = await getAuthToken();
        puter = init(authToken);
        authSpinner.stop('Puter authentication successful!\n');
    } catch (error) {
        authSpinner.stop('Puter authentication failed!', false);
        console.log(chalk.red(error.message));
        process.exit(1);
    }

    console.log(chalk.cyan(`📂 Working Directory: ${currentDir}`));
    console.log(chalk.gray(`💡 Tip: Type 'exit' or 'quit' to terminate the session.\n`));

    let chatHistory = [];

    while (true) {
        const userInput = await askQuestion(chalk.greenBright('You ❯ '));

        if (userInput.trim().toLowerCase() === 'exit' || userInput.trim().toLowerCase() === 'quit') {
            console.log(chalk.yellow('\n👋 AI Agent shutting down. Goodbye!'));
            rl.close();
            break;
        }

        if (!userInput.trim()) continue;

        const aiSpinner = new TerminalSpinner('AI is analyzing project context and thinking...');
        aiSpinner.start();

        try {
            const projectContext = await getProjectContext();

            // English System Prompt with DELETE action included
            const systemPrompt = `
You are an expert software developer AI assistant. Below is the current state of the user's project.

${projectContext}

User Request: "${userInput}"

You can take the following actions to fulfill the request. You MUST use this exact formatting for actions:

1. To CREATE a new file (CREATE):[CREATE: path/to/newfile.js]
Write the complete code here...
[/CREATE]

2. To UPDATE an existing file (UPDATE):[UPDATE: path/to/file.js]
<<<< SEARCH
exact old code that needs to be replaced
==== REPLACE
new code to insert
>>>>
[/UPDATE]

3. To DELETE an existing file (DELETE):
[DELETE: path/to/file.js]

Rules:
- Do NOT wrap action blocks (like [CREATE], [UPDATE], [DELETE]) in markdown backticks (\`\`\`). Output them directly.
- You can perform multiple actions (CREATE, UPDATE, DELETE) simultaneously in a single response.
- Provide a brief summary of what you did outside the action blocks.
            `;

            chatHistory.push({ role: "user", content: systemPrompt });
            
            const aiResponse = await puter.ai.chat(chatHistory, { model: 'gemini-2.5-pro' });
            
            const responseText = typeof aiResponse === 'string' 
                ? aiResponse 
                : (aiResponse?.message?.content || "");

            if (!responseText) {
                aiSpinner.stop('Failed to get a valid response from AI.', false);
                continue;
            }
            
            chatHistory.push({ role: "assistant", content: responseText });

            aiSpinner.update('Applying changes to your files...');
            await new Promise(r => setTimeout(r, 800)); // Small delay for smooth UI transition
            aiSpinner.stop('AI response processed successfully!\n');

            // --- 1. PROCESS DELETE ACTIONS ---
            const deleteRegex = /\[DELETE:\s*(.+?)\]/g;
            let deleteMatch;
            while ((deleteMatch = deleteRegex.exec(responseText)) !== null) {
                const filePath = deleteMatch[1].trim();
                const fullPath = path.join(currentDir, filePath);
                
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log(chalk.bgRed.white.bold(` DELETE `) + chalk.red(` File deleted: ${filePath}`));
                } else {
                    console.log(chalk.bgYellow.black.bold(` WARNING `) + chalk.yellow(` File not found to delete: ${filePath}`));
                }
            }

            // --- 2. PROCESS CREATE ACTIONS ---
            const createRegex = /\[CREATE:\s*(.+?)\]([\s\S]*?)\[\/CREATE\]/g;
            let createMatch;
            while ((createMatch = createRegex.exec(responseText)) !== null) {
                const filePath = createMatch[1].trim();
                const fileContent = createMatch[2].trim();
                const fullPath = path.join(currentDir, filePath);
                
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, fileContent, 'utf-8');
                console.log(chalk.bgGreen.black.bold(` CREATE `) + chalk.green(` File created: ${filePath}`));
            }

            // --- 3. PROCESS UPDATE ACTIONS ---
            const updateRegex = /\[UPDATE:\s*(.+?)\][\s\S]*?<<<< SEARCH\n([\s\S]*?)==== REPLACE\n([\s\S]*?)>>>>[\s\S]*?\[\/UPDATE\]/g;
            let updateMatch;
            while ((updateMatch = updateRegex.exec(responseText)) !== null) {
                const filePath = updateMatch[1].trim();
                const searchBlock = updateMatch[2].trim();
                const replaceBlock = updateMatch[3].trim();
                const fullPath = path.join(currentDir, filePath);

                if (fs.existsSync(fullPath)) {
                    let fileContent = fs.readFileSync(fullPath, 'utf-8');
                    if (fileContent.includes(searchBlock)) {
                        fileContent = fileContent.replace(searchBlock, replaceBlock);
                        fs.writeFileSync(fullPath, fileContent, 'utf-8');
                        console.log(chalk.bgBlue.white.bold(` UPDATE `) + chalk.blue(` File updated: ${filePath}`));
                    } else {
                        console.log(chalk.bgYellow.black.bold(` WARNING `) + chalk.yellow(` Search block didn't match in: ${filePath}`));
                    }
                } else {
                    console.log(chalk.bgRed.white.bold(` ERROR `) + chalk.red(` File not found to update: ${filePath}`));
                }
            }

            // Clean action blocks from the message to show simple conversational text
            const cleanMessage = responseText
                .replace(/\[CREATE[\s\S]*?\[\/CREATE\]/g, '')
                .replace(/\[UPDATE[\s\S]*?\[\/UPDATE\]/g, '')
                .replace(/\[DELETE:[\s\S]*?\]/g, '')
                .trim();
            
            if (cleanMessage) {
                console.log(chalk.magenta.bold(`\n🤖 AI Agent:`));
                // Call live typing effect
                await typeText(cleanMessage, 10);
            }

        } catch (error) {
            aiSpinner.stop('Error communicating with AI!', false);
            console.log(chalk.red(error.message));
        }
    }
}

startInteractiveChat();