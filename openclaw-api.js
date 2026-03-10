const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// Memory directory
const MEMORY_DIR = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace', 'memory');

// Helper to run openclaw commands
function runOpenClaw(args) {
  try {
    const output = execSync(`openclaw ${args}`, { 
      encoding: 'utf-8', 
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output);
  } catch (error) {
    // If it timed out, return a partial response
    if (error.message.includes('ETIMEDOUT')) {
      return { error: 'Command timed out', partial: true };
    }
    throw error;
  }
}

// Get agent's SOUL
app.get('/api/soul', (req, res) => {
  const soulPath = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace', 'SOUL.md');
  try {
    const data = fs.readFileSync(soulPath, 'utf8');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get USER.md
app.get('/api/user', (req, res) => {
  const userPath = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace', 'USER.md');
  try {
    const data = fs.readFileSync(userPath, 'utf8');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get MEMORY.md (long-term memory)
app.get('/api/memory', (req, res) => {
  const memoryPath = path.join(MEMORY_DIR, 'MEMORY.md');
  try {
    const data = fs.readFileSync(memoryPath, 'utf8');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get daily memories
app.get('/api/memory/daily', (req, res) => {
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    const dailyFiles = files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 7);
    
    const memories = dailyFiles.map(file => {
      const date = file.replace('.md', '');
      const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf-8');
      return { date, content };
    });
    
    res.json({ success: true, data: memories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search memories
app.get('/api/memory/search', (req, res) => {
  const query = req.query.q || '';
  if (!query) {
    return res.json({ success: true, data: [] });
  }
  
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    const results = [];
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf-8');
      const lines = content.split('\n').filter(line => 
        line.toLowerCase().includes(query.toLowerCase())
      );
      if (lines.length > 0) {
        results.push({ file, matches: lines });
      }
    }
    
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get OpenClaw status
app.get('/api/status', (req, res) => {
  try {
    const data = runOpenClaw('status --json');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get agents
app.get('/api/agents', (req, res) => {
  try {
    const data = runOpenClaw('agents list --json');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current agent (Jarvis)
app.get('/api/agent', (req, res) => {
  try {
    const agents = runOpenClaw('agents list --json');
    // Find the default agent (main)
    const mainAgent = Array.isArray(agents) ? agents.find(a => a.isDefault) : agents[0];
    
    // Get sessions to determine current activity
    const sessions = runOpenClaw('sessions --json');
    
    // Determine if agent is busy (has recent session activity)
    let isBusy = false;
    if (sessions && sessions.sessions) {
      const recentSessions = sessions.sessions.filter(s => s.ageMs < 60000); // Last minute
      isBusy = recentSessions.some(s => s.key.includes('telegram:direct'));
    }
    
    res.json({ 
      success: true, 
      data: {
        ...mainAgent,
        status: isBusy ? 'busy' : 'active',
        lastActive: sessions?.sessions?.[0]?.updatedAt || Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get subagents (sessions spawned by main agent)
app.get('/api/subagents', (req, res) => {
  try {
    const sessions = runOpenClaw('sessions --json');
    
    if (!sessions || !sessions.sessions) {
      return res.json({ success: true, data: [] });
    }
    
    // Filter for subagent sessions (those with 'subagent' in the key)
    const subagents = sessions.sessions
      .filter(s => s.key.includes('subagent'))
      .map(s => ({
        id: s.sessionId,
        key: s.key,
        status: s.ageMs < 300000 ? 'running' : (s.abortedLastRun ? 'failed' : 'completed'),
        model: s.model,
        lastActive: s.updatedAt,
        ageMs: s.ageMs,
        totalTokens: s.totalTokens
      }));
    
    res.json({ success: true, data: subagents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get projects
app.get('/api/projects', (req, res) => {
  try {
    const projectsPath = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace', 'projects');
    const projects = fs.readdirSync(projectsPath).filter(p => !p.startsWith('.'));
    const data = projects.map((name, index) => ({ id: index + 1, name, status: 'Active', priority: 'Medium' }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  const { name, url, priority, prompt } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, error: 'Project name is required' });
  }

  const projectId = name.toLowerCase().replace(/\s+/g, '-');
  const projectUrl = url || `https://github.com/davisernst04/${projectId}`;
  
  const project = {
    id: projectId,
    name,
    url: projectUrl,
    priority: priority || 'Medium',
    status: 'In Progress',
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  // If prompt is provided, create project directory and spawn subagent
  let subagentResult = null;
  if (prompt && prompt.trim()) {
    try {
      const projectsDir = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace', 'projects');
      const projectDir = path.join(projectsDir, projectId);
      
      // Create project directory
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
        // Create README with prompt info
        const readmeContent = `# ${name}\n\n**Created via Mission Control**\n\n**Prompt:** ${prompt}\n\n---\n\nThis project was created based on the above prompt.`;
        fs.writeFileSync(path.join(projectDir, 'README.md'), readmeContent);
        console.log('[Projects API] Created project directory: ' + projectDir);
      }
      
      // Spawn a gemini-cli subagent
      const { spawn } = require('child_process');
      const workspaceDir = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace');
      const geminiPath = '/home/davis/.npm-global/bin/gemini';
      
      // Use -p flag to run in non-interactive mode
      const geminiProcess = spawn(geminiPath, ['-y', '-p', prompt], {
        cwd: workspaceDir,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'], // Capture stdout and stderr
        shell: true
      });

      // Log stdout and stderr from the spawned process
      geminiProcess.stdout.on('data', (data) => {
        console.log(`[Gemini stdout] ${data}`);
      });
      geminiProcess.stderr.on('data', (data) => {
        console.error(`[Gemini stderr] ${data}`);
      });
      geminiProcess.on('error', (err) => {
        console.error('[Gemini process] Error:', err.message);
      });
      geminiProcess.on('close', (code) => {
        console.log(`[Gemini process] exited with code ${code}`);
      });
      
      geminiProcess.unref();
      
      geminiProcess.unref();
      
      subagentResult = {
        spawned: true,
        message: 'Subagent spawned to create project. Check back later for completion.',
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
      };
      
      console.log('[Projects API] Spawned subagent for project: ' + name);
    } catch (subagentError) {
      console.error('[Projects API] Error creating project: ' + subagentError.message);
      subagentResult = {
        spawned: false,
        error: subagentError.message
      };
    }
  }

  res.json({ 
    success: true, 
    data: {
      ...project,
      subagent: subagentResult
    }
  });
});

// Get career/internships
app.get('/api/career', (req, res) => {
  const careerPath = path.join(process.env.HOME || '/home/davis', '.openclaw', 'workspace', 'career', 'internships.md');
  try {
    const data = fs.readFileSync(careerPath, 'utf8');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cron jobs
app.get('/api/cron/jobs', (req, res) => {
  try {
    const cronJobs = runOpenClaw('cron list --json');
    res.json({ success: true, data: cronJobs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw API running on port ${PORT}`);
  console.log(`Access via Tailscale: http://100.97.211.24:${PORT}`);
});
