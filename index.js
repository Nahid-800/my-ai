#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import puter from '@puter/puter.js';
import readline from 'readline';

// টার্মিনালে ইনপুট নেওয়ার জন্য Setup
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const currentDir = process.cwd();

// প্রম্পট নেওয়ার ফাংশন
const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function getProjectContext() {
    // প্রজেক্টের সব ফাইল খুঁজবে (যাতে AI বুঝতে পারে কী কী ফাইল আছে)
    const files = await glob('**/*.{js,jsx,css,html}', { ignore: 'node_modules/**' });
    let context = `প্রজেক্ট ফোল্ডার: ${currentDir}\n\nবর্তমান ফাইলসমূহ:\n${files.join('\n')}\n\n`;
    
    // ফাইলগুলোর ভেতরের কোড পড়ে AI কে দেওয়া হচ্ছে
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
    console.log(chalk.blue.bold('\n🤖 Nahid AI Agent চালু হয়েছে! (Puter.js Powered)'));
    console.log(chalk.cyan(`প্রজেক্ট ডিরেক্টরি: ${currentDir}`));
    console.log(chalk.gray(`(চ্যাট বন্ধ করতে 'exit' বা 'quit' লিখুন)\n`));

    // চ্যাট হিস্ট্রি সেভ রাখার জন্য অ্যারে
    let chatHistory =[];

    while (true) {
        const userInput = await askQuestion(chalk.green('You: '));

        if (userInput.trim().toLowerCase() === 'exit' || userInput.trim().toLowerCase() === 'quit') {
            console.log(chalk.yellow('\n👋 AI Agent বন্ধ করা হলো। ধন্যবাদ!'));
            rl.close();
            break;
        }

        if (!userInput.trim()) continue;

        console.log(chalk.yellow('⏳ AI প্রজেক্ট রিড করছে এবং চিন্তা করছে...'));

        try {
            const projectContext = await getProjectContext();

            const systemPrompt = `
            তুমি একজন এক্সপার্ট ডেভেলপার। ইউজারের প্রজেক্টের বর্তমান অবস্থা নিচে দেওয়া হলো।
            
            ${projectContext}
            
            ইউজারের নির্দেশ: "${userInput}"
            
            তুমি চাইলে নিচের ২টি অ্যাকশন নিতে পারো। তোমাকে অবশ্যই এই exact ফরম্যাট ব্যবহার করতে হবে:
            
            ১. নতুন ফাইল তৈরি করতে (CREATE):
            [CREATE: path/to/newfile.js]
            এখানে কোড লিখবে...[/CREATE]
            
            ২. পুরোনো ফাইল আপডেট করতে (UPDATE):[UPDATE: path/to/file.js]
            <<<< SEARCH
            পুরোনো কোড যা মুছতে হবে
            ==== REPLACE
            নতুন কোড যা বসাতে হবে
            >>>>
            [/UPDATE]
            
            নোট: কোনো মার্কডাউন (\`\`\`) ব্লক অ্যাকশন ট্যাগের ভেতরে ব্যবহার করবে না। শুধু সরাসরি কোড দেবে। তুমি চাইলে একসাথে নতুন ফাইল তৈরি এবং পুরোনো ফাইল আপডেট করতে পারো।
            `;

            // Puter.js দিয়ে AI Call করা
            chatHistory.push({ role: "user", content: systemPrompt });
            
            const aiResponse = await puter.ai.chat(chatHistory, { model: 'gemini-2.5-pro' });
            const responseText = aiResponse.message.content;
            
            chatHistory.push({ role: "assistant", content: responseText });

            console.log(chalk.magenta('\n✨ AI রেসপন্স পেয়েছে! কাজ করা হচ্ছে...\n'));

            // ১. নতুন ফাইল তৈরি করা (CREATE Logic)
            const createRegex = /\[CREATE:\s*(.+?)\]([\s\S]*?)\[\/CREATE\]/g;
            let createMatch;
            while ((createMatch = createRegex.exec(responseText)) !== null) {
                const filePath = createMatch[1].trim();
                const fileContent = createMatch[2].trim();
                const fullPath = path.join(currentDir, filePath);
                
                // ফোল্ডার না থাকলে তৈরি করে নেবে
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, fileContent, 'utf-8');
                console.log(chalk.bgGreen.black(` CREATE `) + chalk.green(` ${filePath} ফাইলটি তৈরি করা হয়েছে!`));
            }

            // ২. পুরোনো কোড এডিট করা (UPDATE Logic)
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
                        console.log(chalk.bgBlue.white(` UPDATE `) + chalk.blue(` ${filePath} ফাইলটি আপডেট করা হয়েছে!`));
                    } else {
                        console.log(chalk.bgRed.white(` WARNING `) + chalk.red(` ${filePath} ফাইলে Search ব্লকটি মেলেনি।`));
                    }
                } else {
                    console.log(chalk.red(`❌ ফাইল পাওয়া যায়নি: ${filePath}`));
                }
            }

            // AI যদি সাধারণ কোনো মেসেজ দেয় (যা ফাইল এডিট বাদে)
            const cleanMessage = responseText
                .replace(/\[CREATE[\s\S]*?\[\/CREATE\]/g, '')
                .replace(/\[UPDATE[\s\S]*?\[\/UPDATE\]/g, '')
                .trim();
            
            if (cleanMessage) {
                console.log(chalk.cyan(`\n🤖 AI: ${cleanMessage}\n`));
            }

        } catch (error) {
            console.log(chalk.red('\n❌ Error: AI এর সাথে কানেক্ট করতে সমস্যা হয়েছে!'));
            console.log(chalk.red(error.message));
        }
    }
}

startInteractiveChat();