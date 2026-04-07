#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import readline from 'readline';
import fetch from 'node-fetch';   // npm install node-fetch যদি না থাকে

// ====================== CONFIG ======================
const API_KEY = "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";

const MODELS = [
  "qwen/qwen3.6-plus:free",      // সবচেয়ে ভালো সামগ্রিক
  "qwen/qwen3-coder:free",       // Pure coding + complex logic
  "mistral/devstral-2:free",     // Agentic + multi-file
  "stepfun/step-3.5-flash:free",
  "nvidia/nemotron-3-super-120b-a12b:free"
];

const currentDir = process.cwd();

// ====================== SETUP ======================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// ====================== UI HELPERS ======================
class TerminalSpinner {
  constructor(message) {
    this.message = message;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = null;
    this.currentFrame = 0;
  }
  start() {
    process.stdout.write('\n');
    this.interval = setInterval(() => {
      process.stdout.write(`\r\x1b[K${chalk.cyan(this.frames[this.currentFrame])} ${chalk.yellow(this.message)}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }
  stop(finalMessage, isSuccess = true) {
    clearInterval(this.interval);
    const icon = isSuccess ? chalk.green('✔') : chalk.red('✖');
    process.stdout.write(`\r\x1b[K${icon} ${isSuccess ? chalk.green(finalMessage) : chalk.red(finalMessage)}\n`);
  }
}

const typeText = async (text, speed = 12) => {
  for (const char of text) {
    process.stdout.write(chalk.cyan(char));
    await new Promise(r => setTimeout(r, speed));
  }
  console.log('');
};

// ====================== PROJECT CONTEXT ======================
async function getProjectContext() {
  try {
    const files = await glob('**/*.{js,jsx,ts,tsx,css,scss,tailwind.config*,next.config*,package.json}', { 
      ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**'] 
    });

    let context = `Project Root: ${currentDir}\nTotal relevant files: ${files.length}\n\n`;

    // শুধু গুরুত্বপূর্ণ ফাইলের কনটেন্ট নেব (খুব বড় প্রজেক্টে crash এড়ানোর জন্য)
    for (const file of files.slice(0, 25)) {  // সর্বোচ্চ ২৫টা ফাইল
      const fullPath = path.join(currentDir, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size < 100 * 1024) { // 100KB এর নিচে
        const content = fs.readFileSync(fullPath, 'utf-8');
        context += `\n--- File: ${file} ---\n${content}\n`;
      }
    }
    return context;
  } catch (e) {
    return `Project Directory: ${currentDir}\n(Unable to read full context)`;
  }
}

// ====================== MAIN CHAT ======================
async function startAIAssistant() {
  console.log(chalk.blue.bold('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║             🚀 Nahid Next.js AI Agent (OpenRouter)             ║'));
  console.log(chalk.blue.bold('╚══════════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.cyan(`📂 Working in: ${currentDir}`));
  console.log(chalk.gray('💡 Type "exit", "quit" or Ctrl+C to stop.\n'));

  let chatHistory = [];

  while (true) {
    const userInput = await askQuestion(chalk.greenBright('You ❯ '));

    if (['exit', 'quit', 'q'].includes(userInput.trim().toLowerCase())) {
      console.log(chalk.yellow('\n👋 Goodbye! AI Agent terminated.\n'));
      rl.close();
      break;
    }

    if (!userInput.trim()) continue;

    const spinner = new TerminalSpinner('AI is thinking about your project...');
    spinner.start();

    try {
      const projectContext = await getProjectContext();

      const systemPrompt = `You are an expert full-stack Next.js (App Router) developer with deep knowledge of React, TypeScript, Tailwind CSS, Shadcn/ui, Server Actions, Prisma/Drizzle, Supabase, authentication, form validation, and modern best practices.

Project Context:
${projectContext}

User Request: "${userInput}"

Rules:
- Handle BOTH beautiful UI changes and complex functionality/logic.
- Use modern, clean, production-ready code.
- You can CREATE new files, UPDATE existing files, or DELETE files.
- Use this exact format for actions (do not wrap in code blocks):

[CREATE: path/to/file.tsx]
(full code here)
[/CREATE]

[UPDATE: path/to/file.tsx]
<<<< SEARCH
old code
==== REPLACE
new code
>>>>
[/UPDATE]

[DELETE: path/to/file.js]

- After actions, give a short friendly summary.
- Always think step-by-step before making changes.`;

      // OpenRouter API Call with fallback
      let aiResponseText = "";
      let usedModel = "";

      for (const model of MODELS) {
        try {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost",
              "X-OpenRouter-Title": "Nahid Next.js AI Agent"
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemPrompt },
                ...chatHistory,
                { role: "user", content: userInput }
              ],
              temperature: 0.7,
              max_tokens: 8192
            })
          });

          const data = await response.json();

          if (response.ok && data.choices?.[0]?.message?.content) {
            aiResponseText = data.choices[0].message.content;
            usedModel = model.split('/').pop();
            break;
          }
        } catch (e) {
          // Try next model
          continue;
        }
      }

      if (!aiResponseText) {
        spinner.stop('All models failed. Please try again later.', false);
        continue;
      }

      spinner.stop(`Response received from ${usedModel}`);

      // Save to history
      chatHistory.push({ role: "user", content: userInput });
      chatHistory.push({ role: "assistant", content: aiResponseText });

      // === Process Actions (CREATE / UPDATE / DELETE) ===
      // (আগের কোডের মতোই রাখা হয়েছে, আরও robust করা হয়েছে)

      // DELETE
      const deleteRegex = /\[DELETE:\s*(.+?)\]/gi;
      let match;
      while ((match = deleteRegex.exec(aiResponseText)) !== null) {
        const filePath = match[1].trim();
        const fullPath = path.join(currentDir, filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(chalk.bgRed.white(' DELETE ') + chalk.red(` ${filePath}`));
        }
      }

      // CREATE
      const createRegex = /\[CREATE:\s*(.+?)\]([\s\S]*?)\[\/CREATE\]/gi;
      while ((match = createRegex.exec(aiResponseText)) !== null) {
        const filePath = match[1].trim();
        const content = match[2].trim();
        const fullPath = path.join(currentDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        console.log(chalk.bgGreen.black(' CREATE ') + chalk.green(` ${filePath}`));
      }

      // UPDATE (simple search-replace)
      const updateRegex = /\[UPDATE:\s*(.+?)\][\s\S]*?<<<< SEARCH\n([\s\S]*?)==== REPLACE\n([\s\S]*?)>>>>/gi;
      while ((match = updateRegex.exec(aiResponseText)) !== null) {
        const filePath = match[1].trim();
        const search = match[2].trim();
        const replace = match[3].trim();
        const fullPath = path.join(currentDir, filePath);

        if (fs.existsSync(fullPath)) {
          let content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes(search)) {
            content = content.replace(search, replace);
            fs.writeFileSync(fullPath, content, 'utf-8');
            console.log(chalk.bgBlue.white(' UPDATE ') + chalk.blue(` ${filePath}`));
          }
        }
      }

      // Show clean AI response with typing effect
      const cleanResponse = aiResponseText
        .replace(/\[CREATE[\s\S]*?\/CREATE\]/gi, '')
        .replace(/\[UPDATE[\s\S]*?>>>>/gi, '')
        .replace(/\[DELETE:[\s\S]*?\]/gi, '')
        .trim();

      if (cleanResponse) {
        console.log(chalk.magenta.bold('\n🤖 AI Agent:'));
        await typeText(cleanResponse);
      }

    } catch (error) {
      spinner.stop('Something went wrong!', false);
      console.log(chalk.red(error.message));
    }
  }
}

startAIAssistant();
