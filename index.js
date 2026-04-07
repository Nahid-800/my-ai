#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import readline from 'readline';

const API_KEY = "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";

const MODELS = [
  "qwen/qwen3.6-plus:free",
  "qwen/qwen3-coder:free",
  "mistral/devstral-2:free",
  "stepfun/step-3.5-flash:free"
];

const currentDir = process.cwd();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

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

async function getProjectContext() {
  try {
    const files = await glob('**/*.{js,jsx,ts,tsx,html,css}', { 
      ignore: ['node_modules/**', '.next/**', 'dist/**'] 
    });
    let context = `Project Root: ${currentDir}\n`;
    for (const file of files.slice(0, 20)) {
      const fullPath = path.join(currentDir, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size < 80 * 1024) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        context += `\n--- File: ${file} ---\n${content}\n`;
      }
    }
    return context;
  } catch (e) {
    return `Project Directory: ${currentDir}`;
  }
}

async function startAIAssistant() {
  console.log(chalk.blue.bold('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║             🚀 Nahid AI Agent (OpenRouter) - Enhanced UI             ║'));
  console.log(chalk.blue.bold('╚══════════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.cyan(`📂 Working Directory: ${currentDir}`));
  console.log(chalk.gray('💡 Type "exit" or "quit" to stop.\n'));

  let chatHistory = [];

  while (true) {
    const userInput = await askQuestion(chalk.greenBright('You ❯ '));

    if (['exit', 'quit', 'q'].includes(userInput.trim().toLowerCase())) {
      console.log(chalk.yellow('\n👋 Goodbye!\n'));
      rl.close();
      break;
    }

    if (!userInput.trim()) continue;

    const spinner = new TerminalSpinner('AI is thinking...');
    spinner.start();

    try {
      const projectContext = await getProjectContext();

      const systemPrompt = `You are an expert full-stack developer. 
You MUST strictly follow the user's requested file extension and technology.

Important Rules (Never break these):
- If user says ".html", ".css", "plain HTML", "vanilla JS" → give only HTML/CSS/JS. Never give React, TSX, JSX or Next.js code.
- If user says "React", "Next.js", ".tsx", ".jsx" → then use React/TSX.
- Do not assume Next.js/React unless user explicitly mentions it.
- Do not use markdown formatting like **bold**, *italic*, or \`\`\` code blocks in your final response.
- For code, use plain text with clear [CREATE], [UPDATE], [DELETE] blocks only.
- Keep summary short, clean and natural (no ** or markdown).
- Think step by step but output only the required format.

Project Context:
${projectContext}

User Request: "${userInput}"

Output Format:
- First perform actions using exact tags: [CREATE: path], [UPDATE: path], [DELETE: path]
- Then give a short, clean, natural summary without any markdown.`;

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
              "X-OpenRouter-Title": "Nahid AI Agent"
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemPrompt },
                ...chatHistory,
                { role: "user", content: userInput }
              ],
              temperature: 0.65,
              max_tokens: 8192
            })
          });

          const data = await response.json();
          if (response.ok && data.choices?.[0]?.message?.content) {
            aiResponseText = data.choices[0].message.content;
            usedModel = model.split('/').pop();
            break;
          }
        } catch (e) { continue; }
      }

      if (!aiResponseText) {
        spinner.stop('Failed to get response', false);
        continue;
      }

      spinner.stop(`Response from ${usedModel}`);

      chatHistory.push({ role: "user", content: userInput });
      chatHistory.push({ role: "assistant", content: aiResponseText });

      // Action processing (CREATE, UPDATE, DELETE) — আগের মতোই রাখা হয়েছে
      // ... (DELETE, CREATE, UPDATE logic আগের কোড থেকে রেখে দাও)

      // Clean response for display
      const cleanResponse = aiResponseText
        .replace(/$$   CREATE[\s\S]*?\/CREATE   $$/gi, '')
        .replace(/$$   UPDATE[\s\S]*?>>>>/gi, '')
        .replace(/\[DELETE:[\s\S]*?   $$/gi, '')
        .replace(/\*\*.*?\*\*/g, '')   // bold সরানো
        .replace(/```[\s\S]*?```/g, '') // code block সরানো
        .trim();

      if (cleanResponse) {
        console.log(chalk.magenta.bold('\n🤖 AI Agent:'));
        await typeText(cleanResponse, 10);
      }

    } catch (error) {
      spinner.stop('Error occurred!', false);
      console.log(chalk.red(error.message));
    }
  }
}

startAIAssistant();
