"""
VS Code Chat Session Bridge
Intercepts and preserves chat context across restarts
"""

import json
import os
from datetime import datetime
from pathlib import Path

class VSCodeChatBridge:
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self.context_dir = Path(workspace_path) / "claude-context-fork"
        self.context_dir.mkdir(exist_ok=True)
        
    def capture_session_state(self):
        """Capture current VS Code state for context restoration"""
        state = {
            "timestamp": datetime.now().isoformat(),
            "workspace": self.workspace_path,
            "open_files": self._get_open_files(),
            "git_status": self._get_git_status(),
            "recent_changes": self._get_recent_changes(),
            "active_terminal": self._get_terminal_state(),
            "cursor_position": self._get_cursor_position()
        }
        
        # Save to context memory
        session_file = self.context_dir / f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(session_file, 'w') as f:
            json.dump(state, f, indent=2)
            
        return state
    
    def generate_restoration_prompt(self, conversation_id: str = None):
        """Generate prompt to restore session context with Claude"""
        latest_session = self._get_latest_session()
        
        prompt = f"""
CONTEXT RESTORATION REQUEST

Workspace: {self.workspace_path}
Last Session: {latest_session.get('timestamp', 'Unknown')}

WORKSPACE STATE:
- Open Files: {latest_session.get('open_files', [])}
- Git Status: {latest_session.get('git_status', 'Unknown')}
- Active Terminal: {latest_session.get('active_terminal', 'None')}

PREVIOUS CONVERSATION:
{f"Load conversation ID: {conversation_id}" if conversation_id else "No previous conversation specified"}

RESTORATION GOALS:
1. Restore technical context from previous session
2. Continue work seamlessly where we left off  
3. Maintain awareness of current workspace state
4. Bridge any time gap since last session

Please bootstrap context for continuing our development work.
"""
        return prompt
    
    def _get_open_files(self):
        """Extract currently open files from VS Code workspace"""
        # This would integrate with VS Code API or file system
        # For now, simulate based on common patterns
        try:
            import subprocess
            result = subprocess.run(['find', self.workspace_path, '-name', '*.py', '-o', '-name', '*.js', '-o', '-name', '*.md'], 
                                  capture_output=True, text=True)
            return result.stdout.strip().split('\n')[:10]  # Limit to recent files
        except:
            return []
    
    def _get_git_status(self):
        """Get current git status"""
        try:
            import subprocess
            result = subprocess.run(['git', 'status', '--porcelain'], 
                                  cwd=self.workspace_path, capture_output=True, text=True)
            return result.stdout.strip()
        except:
            return "No git status available"
    
    def _get_recent_changes(self):
        """Get recent file modifications"""
        try:
            import subprocess
            result = subprocess.run(['git', 'log', '--oneline', '-5'], 
                                  cwd=self.workspace_path, capture_output=True, text=True)
            return result.stdout.strip()
        except:
            return "No recent changes found"
    
    def _get_terminal_state(self):
        """Get current terminal working directory"""
        return os.getcwd()
    
    def _get_cursor_position(self):
        """Would integrate with VS Code API for cursor position"""
        return "Position not available"
    
    def _get_latest_session(self):
        """Get the most recent session data"""
        session_files = list(self.context_dir.glob("session_*.json"))
        if not session_files:
            return {}
        
        latest_file = max(session_files, key=os.path.getctime)
        with open(latest_file, 'r') as f:
            return json.load(f)

# Usage example
if __name__ == "__main__":
    bridge = VSCodeChatBridge("/Users/bradleycoughlin/local_code/agent-langchain")
    
    # Capture current state
    state = bridge.capture_session_state()
    print("Session state captured")
    
    # Generate restoration prompt
    prompt = bridge.generate_restoration_prompt("agent-langchain-development")
    print("\nRestoration prompt:")
    print(prompt)