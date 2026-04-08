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

const MODELS = [
  "qwen/qwen3.6-plus:free",
  "qwen/qwen3-coder:free",
  "mistral/devstral-2:free",
  "stepfun/step-3.5-flash:free",
  "nvidia/nemotron-3-super-120b-a12b:free"
];

const currentDir = process.cwd();

// ====================== PROJECT CONTEXT ======================
async function getProjectContext() {
  try {
    const files = await glob('**/*.{js,jsx,ts,tsx,css,scss,tailwind.config*,next.config*,package.json}', { 
      ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**'] 
    });

    let context = `Project Root: ${currentDir}\nTotal relevant files: ${files.length}\n\n`;

    for (const file of files.slice(0, 25)) { 
      const fullPath = path.join(currentDir, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size < 100 * 1024) { 
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
  console.clear();
  
  // সুন্দর Intro (Gemini CLI স্টাইল)
  p.intro(chalk.bgBlue.white.bold(' 🚀 Nahid Next.js AI Agent '));
  p.note(`📂 Working Directory: ${currentDir}\n💡 Type "exit" or "quit" to stop.`, 'Environment Info');

  let chatHistory = [];

  while (true) {
    // প্রফেশনাল ইনপুট প্রম্পট
    const userInput = await p.text({
      message: chalk.greenBright('You:'),
      placeholder: 'What do you want to build or change?',
    });

    // Handle Exit (Ctrl+C or typed exit)
    if (p.isCancel(userInput) || ['exit', 'quit', 'q'].includes(userInput.trim().toLowerCase())) {
      p.outro(chalk.yellow('👋 Goodbye! AI Agent terminated.'));
      process.exit(0);
    }

    if (!userInput.trim()) continue;

    // Clack এর বিল্ট-ইন প্রফেশনাল স্পিনার
    const s = p.spinner();
    s.start('AI is analyzing your project...');

    try {
      const projectContext = await getProjectContext();

      const systemPrompt = `You are an expert full-stack Next.js (App Router) developer...
(আপনার আগের রুলসগুলো এখানে থাকবে)
Rules:
- Handle BOTH beautiful UI changes and complex functionality/logic.
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
Project Context:\n${projectContext}`;

      let aiResponseText = "";
      let usedModel = "";

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
              messages: [
                { role: "system", content: systemPrompt },
                ...chatHistory,
                { role: "user", content: userInput }
              ],
              temperature: 0.7,
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
        s.stop(chalk.red('✖ All models failed. Please try again.'));
        continue;
      }

      s.stop(chalk.green(`✔ Response received from ${usedModel}`));

      chatHistory.push({ role: "user", content: userInput });
      chatHistory.push({ role: "assistant", content: aiResponseText });

      // === Process Actions (CREATE / UPDATE / DELETE) ===
      
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
          }
        }
      }

      // Show Action Summaries inside a nice CLI box
      if (actionsTaken.length > 0) {
        p.note(actionsTaken.join('\n'), 'File Changes');
      }

      // Clean the response
      const cleanResponse = aiResponseText
        .replace(/\[CREATE[\s\S]*?\/CREATE\]/gi, '')
        .replace(/\[UPDATE[\s\S]*?>>>>/gi, '')
        .replace(/\[DELETE:[\s\S]*?\]/gi, '')
        .trim();

      // Print Markdown beautifully in terminal
      if (cleanResponse) {
        console.log(chalk.cyan.bold('\n🤖 AI Agent:'));
        console.log(marked(cleanResponse)); // Markdown rendering
      }

    } catch (error) {
      s.stop(chalk.red('Something went wrong!'));
      p.log.error(error.message);
    }
  }
}

startAIAssistant();
