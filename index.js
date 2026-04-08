#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import fetch from 'node-fetch';
import * as p from '@clack/prompts'; // Premium UI Library
import { marked } from 'marked';     // Markdown Parser
import TerminalRenderer from 'marked-terminal'; // Markdown to Terminal Colors

// টার্মিনালে মার্কডাউন (Bold, Code blocks) সুন্দর করে দেখানোর সেটিং
marked.setOptions({
  renderer: new TerminalRenderer({
    code: chalk.yellow,
    firstHeading: chalk.blue.bold,
  })
});

// ====================== CONFIG ======================
const API_KEY = "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";

// OpenRouter এর সবচেয়ে Fast এবং Smart Model গুলো দেওয়া হলো
const MODELS = [
  "google/gemini-2.0-flash-lite-preview-02-05:free", // Extremely Fast & Huge Context
  "meta-llama/llama-3.3-70b-instruct:free",          // Great for coding
  "qwen/qwen-2.5-coder-32b-instruct:free",           // Perfect for code generation
];

const currentDir = process.cwd();

// ====================== HELPER FUNCTIONS ======================

// প্রজেক্টের শুধু ফাইল স্ট্রাকচার নিবে (যাতে AI বুঝতে পারে কি কি ফাইল আছে)
async function getProjectTree() {
  const files = await glob('**/*.{js,jsx,ts,tsx,css,scss,json}', { 
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**', '.git/**'] 
  });
  return files.join('\n');
}

// AI কে কল করার গ্লোবাল ফাংশন
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
  console.clear();
  
  // সুন্দর Intro
  p.intro(chalk.bgCyan.black.bold(' 🚀 Nahid Next.js AI Agent '));
  p.note(`📂 Directory: ${currentDir}\n💡 Type "exit" to stop.`, 'Environment Info');

  let chatHistory = [];
  const projectTree = await getProjectTree();

  while (true) {
    // প্রফেশনাল ইনপুট প্রম্পট
    const userInput = await p.text({
      message: chalk.greenBright('What do you want to build or change?'),
      placeholder: 'e.g., Update the Header component to make it responsive...',
    });

    if (p.isCancel(userInput) || ['exit', 'quit', 'q'].includes(userInput.trim().toLowerCase())) {
      p.outro(chalk.yellow('👋 Goodbye! AI Agent terminated.'));
      process.exit(0);
    }

    if (!userInput.trim()) continue;
    chatHistory.push({ role: "user", content: userInput });

    const s = p.spinner();

    try {
      // === STEP 1: Identify which files to read ===
      s.start('🤔 Thinking about which files to read...');
      
      const plannerPrompt = `You are a project analyzer. Look at the user's request and the project file tree.
Project Tree:
${projectTree}

Based on the request, which files do you need to read the content of? 
Return ONLY a comma-separated list of file paths. If none, return "NONE".
Example: src/components/Header.jsx, src/app/page.js`;

      const planResponse = await fetchAI(plannerPrompt, [{ role: "user", content: userInput }]);
      let filesToRead = planResponse.text.split(',').map(f => f.trim()).filter(f => f && f !== 'NONE' && !f.includes('```'));

      // === STEP 2: Read the files visually ===
      let fileContext = "";
      if (filesToRead.length > 0) {
        s.message(chalk.cyan(`📖 I will read:\n  - ${filesToRead.join('\n  - ')}`));
        
        await new Promise(resolve => setTimeout(resolve, 1500)); // Just for visual UI feel

        for (const file of filesToRead) {
          const fullPath = path.join(currentDir, file);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            fileContext += `\n--- File: ${file} ---\n${content}\n`;
          }
        }
        s.message(chalk.green(`✔ Read successful (${filesToRead.length} files)`));
      } else {
        s.message(chalk.blue(`✔ No existing files needed to read.`));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // === STEP 3: Generate Code ===
      s.start('⚡ Generating code and applying changes...');

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
      
      s.stop(chalk.green(`✔ Task completed using ${aiResponse.model}`));

      // === STEP 4: Process Actions (CREATE / UPDATE / DELETE) ===
      let actionsTaken = [];

      // DELETE
      const deleteRegex = /\[DELETE:\s*(.+?)\]/gi;
      let match;
      while ((match = deleteRegex.exec(aiResponseText)) !== null) {
        const filePath = match[1].trim();
        const fullPath = path.join(currentDir, filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          actionsTaken.push(chalk.red(`🗑️ Deleted: ${filePath}`));
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
        actionsTaken.push(chalk.green(`✨ Created: ${filePath}`));
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
            actionsTaken.push(chalk.blue(`📝 Updated: ${filePath}`));
          } else {
            actionsTaken.push(chalk.yellow(`⚠️ Failed to update ${filePath} (Search text not found)`));
          }
        }
      }

      // === STEP 5: Show Summary ===
      if (actionsTaken.length > 0) {
        p.note(actionsTaken.join('\n'), '📦 File Update Summary');
      } else {
        p.note(chalk.gray('No files were changed.'), '📦 File Update Summary');
      }

      // Clean the response from action blocks to show only conversational text
      const cleanResponse = aiResponseText
        .replace(/\[CREATE[\s\S]*?\/CREATE\]/gi, '')
        .replace(/\[UPDATE[\s\S]*?>>>>/gi, '')
        .replace(/\[DELETE:[\s\S]*?\]/gi, '')
        .trim();

      if (cleanResponse) {
        console.log(chalk.cyan.bold('\n🤖 AI Agent Message:'));
        console.log(marked(cleanResponse)); 
      }

      chatHistory.push({ role: "assistant", content: aiResponseText });

    } catch (error) {
      if (s) s.stop(chalk.red('✖ Operation Failed!'));
      p.log.error(error.message);
    }
  }
}

startAIAssistant();
