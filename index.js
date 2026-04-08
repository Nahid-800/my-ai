#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import fetch from 'node-fetch';
import * as p from '@clack/prompts';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
  renderer: new TerminalRenderer({
    code: chalk.yellow,
    firstHeading: chalk.blue.bold,
  })
});

// ====================== CONFIG ======================
const API_KEY = "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";

const MODELS = [
  "openrouter/free",
];

const currentDir = process.cwd();

// ====================== UI STYLES ======================

const UI = {
  // গ্র্যাডিয়েন্ট টেক্সট
  gradient: (text) => {
    const colors = [chalk.magenta, chalk.cyan, chalk.blue, chalk.cyan];
    return text.split('').map((char, i) => colors[i % colors.length](char)).join('');
  },

  // বক্স ড্রয়িং
  box: (title, content, color = 'cyan') => {
    const colorFn = chalk[color];
    const width = 70;
    const border = colorFn('═'.repeat(width));
    const titlePad = Math.floor((width - title.length - 4) / 2);
    
    console.log(`\n${colorFn('╔')}${border}${colorFn('╗')}`);
    console.log(`${colorFn('║')} ${colorFn.bold(title.padStart(title.length + titlePad).padEnd(width - 2))} ${colorFn('║')}`);
    console.log(`${colorFn('╠')}${border}${colorFn('╣')}`);
    
    const lines = content.split('\n');
    lines.forEach(line => {
      const padding = width - line.length - 2;
      console.log(`${colorFn('║')} ${line}${' '.repeat(Math.max(0, padding))} ${colorFn('║')}`);
    });
    
    console.log(`${colorFn('╚')}${border}${colorFn('╝')}\n`);
  },

  // সেপারেটর লাইন
  separator: (color = 'magenta') => {
    console.log(chalk[color]('─'.repeat(70)));
  },

  // স্ট্যাটাস লাইন
  status: (icon, text, color = 'cyan') => {
    console.log(`${chalk[color](icon)} ${chalk.white(text)}`);
  },

  // প্রগ্রেস ইন্ডিকেটর
  progress: (current, total, label) => {
    const width = 30;
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    console.log(`${chalk.magenta(label)} [${bar}] ${current}/${total}`);
  },

  // হেডার
  header: () => {
    console.clear();
    console.log(chalk.bgMagenta.black.bold('  ✨ NAHID - Next.js AI Agent  '));
    console.log(chalk.cyan('═'.repeat(70)));
    console.log(chalk.gray(`📂 Directory: ${currentDir}`));
    console.log(chalk.gray(`🕐 Time: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.cyan('═'.repeat(70)));
    console.log();
  },

  // ফাইল লিস্ট
  fileList: (files) => {
    console.log(chalk.magenta.bold('📋 Files to Process:'));
    files.forEach((file, i) => {
      console.log(chalk.cyan(`   ${i + 1}. ${chalk.yellow(file)}`));
    });
    console.log();
  },

  // সাকসেস মেসেজ
  success: (message) => {
    console.log(chalk.bgGreen.black.bold(' ✔ ') + chalk.green(` ${message}`));
  },

  // ওয়ার্নিং মেসেজ
  warning: (message) => {
    console.log(chalk.bgYellow.black.bold(' ⚠ ') + chalk.yellow(` ${message}`));
  },

  // এরর মেসেজ
  error: (message) => {
    console.log(chalk.bgRed.black.bold(' ✖ ') + chalk.red(` ${message}`));
  },

  // ইনফো মেসেজ
  info: (message) => {
    console.log(chalk.bgBlue.black.bold(' ℹ ') + chalk.blue(` ${message}`));
  },

  // অ্যানিমেটেড লোডার
  spinner: async (message, duration = 1500) => {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const startTime = Date.now();
    let frameIndex = 0;

    return new Promise(resolve => {
      const interval = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(frames[frameIndex % frames.length])} ${message}`);
        frameIndex++;

        if (Date.now() - startTime > duration) {
          clearInterval(interval);
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          resolve();
        }
      }, 80);
    });
  },

  // টেবিল ফরম্যাট
  table: (data) => {
    const colWidths = [20, 40];
    console.log(chalk.cyan('┌' + '─'.repeat(colWidths[0]) + '┬' + '─'.repeat(colWidths[1]) + '┐'));
    
    data.forEach((row, idx) => {
      const col1 = row[0].padEnd(colWidths[0]);
      const col2 = row[1].padEnd(colWidths[1]);
      console.log(chalk.cyan(`│${col1}│${col2}│`));
      
      if (idx < data.length - 1) {
        console.log(chalk.cyan('├' + '─'.repeat(colWidths[0]) + '┼' + '─'.repeat(colWidths[1]) + '┤'));
      }
    });
    
    console.log(chalk.cyan('└' + '─'.repeat(colWidths[0]) + '┴' + '─'.repeat(colWidths[1]) + '┘'));
  }
};

// ====================== HELPER FUNCTIONS ======================

async function getProjectTree() {
  const files = await glob('**/*.{js,jsx,ts,tsx,css,scss,json}', { 
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**', '.git/**'] 
  });
  return files.join('\n');
}

async function fetchAI(systemPrompt, userMessages) {
  for (const model of MODELS) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "system", content: systemPrompt }, ...userMessages],
          temperature: 0.3,
        })
      });

      const data = await response.json();
      if (response.ok && data.choices?.[0]?.message?.content) {
        return { text: data.choices[0].message.content, model: model.split('/').pop() };
      }
    } catch (e) { continue; }
  }
  throw new Error("All models failed.");
}

// ====================== MAIN CLI ======================

async function startAIAssistant() {
  UI.header();

  let chatHistory = [];
  const projectTree = await getProjectTree();

  UI.box('🚀 Welcome to Nahid AI Agent', 
    `This AI assistant will help you:\n` +
    `• Generate and modify code\n` +
    `• Create new components\n` +
    `• Update existing files\n` +
    `• Manage your project structure\n\n` +
    `Type "exit" to quit.`, 'magenta');

  while (true) {
    const userInput = await p.text({
      message: chalk.greenBright('💬 What do you want to build?'),
      placeholder: 'e.g., Create a responsive Header component...',
    });

    if (p.isCancel(userInput) || ['exit', 'quit', 'q'].includes(userInput.trim().toLowerCase())) {
      UI.separator('magenta');
      console.log(chalk.yellow.bold('👋 Thank you for using Nahid AI Agent!'));
      UI.separator('magenta');
      process.exit(0);
    }

    if (!userInput.trim()) continue;

    chatHistory.push({ role: "user", content: userInput });

    try {
      // === STEP 1: Analyze ===
      await UI.spinner(chalk.cyan('🤔 Analyzing your request...'), 1200);
      UI.status('✓', 'Request analyzed successfully', 'green');

      const plannerPrompt = `You are a project analyzer. Look at the user's request and the project file tree.
Project Tree:
${projectTree}

Based on the request, which files do you need to read the content of? 
Return ONLY a comma-separated list of file paths. If none, return "NONE".
Example: src/components/Header.jsx, src/app/page.js`;

      const planResponse = await fetchAI(plannerPrompt, [{ role: "user", content: userInput }]);
      let filesToRead = planResponse.text.split(',').map(f => f.trim()).filter(f => f && f !== 'NONE' && !f.includes('```'));

      // === STEP 2: Read Files ===
      if (filesToRead.length > 0) {
        await UI.spinner(chalk.cyan(`📖 Reading ${filesToRead.length} file(s)...`), 1500);
        UI.fileList(filesToRead);
        
        let fileContext = "";
        for (const file of filesToRead) {
          const fullPath = path.join(currentDir, file);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            fileContext += `\n--- File: ${file} ---\n${content}\n`;
          }
        }
        UI.success(`Read ${filesToRead.length} file(s)`);
      } else {
        await UI.spinner(chalk.cyan('📖 No existing files needed...'), 800);
        UI.info('Creating new files from scratch');
      }

      // === STEP 3: Generate Code ===
      await UI.spinner(chalk.cyan('⚡ Generating code...'), 2000);

      const coderPrompt = `You are an expert full-stack Next.js developer.
Rules:
- Handle BOTH beautiful UI changes and complex logic.
- Use this exact format for actions:
[CREATE: path/to/file.tsx]
code
[/CREATE]
[UPDATE: path/to/file.tsx]
<<<< SEARCH
old code
==== REPLACE
new code
>>>>
[/UPDATE]
[DELETE: path/to/file.js]

Here are the contents of the relevant files:
${fileContext}`;

      const aiResponse = await fetchAI(coderPrompt, chatHistory);
      const aiResponseText = aiResponse.text;
      
      UI.success(`Code generated using ${chalk.yellow(aiResponse.model)}`);

      // === STEP 4: Process Actions ===
      await UI.spinner(chalk.cyan('💾 Applying changes...'), 1500);

      let actionsTaken = [];

      // DELETE
      const deleteRegex = /\[DELETE:\s*(.+?)\]/gi;
      let match;
      while ((match = deleteRegex.exec(aiResponseText)) !== null) {
        const filePath = match[1].trim();
        const fullPath = path.join(currentDir, filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          actionsTaken.push(['🗑️ DELETE', filePath]);
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
        actionsTaken.push(['✨ CREATE', filePath]);
      }

      // UPDATE
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
            actionsTaken.push(['📝 UPDATE', filePath]);
          } else {
            actionsTaken.push(['⚠️ FAILED', filePath]);
          }
        }
      }

      // === STEP 5: Show Summary ===
      if (actionsTaken.length > 0) {
        UI.separator('cyan');
        console.log(chalk.magenta.bold('📦 File Changes Summary:'));
        UI.table(actionsTaken);
      } else {
        UI.info('No files were changed');
      }

      // === STEP 6: Show AI Response ===
      const cleanResponse = aiResponseText
        .replace(/\[CREATE[\s\S]*?\/CREATE\]/gi, '')
        .replace(/\[UPDATE[\s\S]*?>>>>/gi, '')
        .replace(/\[DELETE:[\s\S]*?\]/gi, '')
        .trim();

      if (cleanResponse) {
        UI.separator('cyan');
        console.log(chalk.cyan.bold('🤖 AI Agent Response:\n'));
        console.log(marked(cleanResponse));
      }

      chatHistory.push({ role: "assistant", content: aiResponseText });
      UI.separator('cyan');

    } catch (error) {
      UI.error(error.message);
    }
  }
}

startAIAssistant();
