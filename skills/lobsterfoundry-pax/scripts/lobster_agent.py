#!/usr/bin/env python3
"""
LobsterFoundry Agent Controller
Real-time WebSocket connection for avatar control.
Designed for OpenClaw heartbeat integration.
"""

import json
import os
import sys
import time
import hashlib
import threading
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

# Try to import websocket-client
try:
    import websocket
    HAS_WEBSOCKET = True
except ImportError:
    HAS_WEBSOCKET = False
    print("[LobsterFoundry] WebSocket not available. Install: pip install websocket-client")

# Config
CONFIG_DIR = Path.home() / '.config' / 'lobsterfoundry'
CREDENTIALS_FILE = CONFIG_DIR / 'credentials.json'
STATE_FILE = CONFIG_DIR / 'agent_state.json'
DEFAULT_SERVER = os.environ.get('LOBSTER_SERVER', 'http://localhost:5173')

class LobsterFoundryAgent:
    """
    Agent controller for LobsterFoundry.
    Manages connection, avatar, and real-time actions.
    """
    
    def __init__(self, server=None):
        self.server = server or DEFAULT_SERVER
        self.ws_url = self.server.replace('http', 'ws') + '/api/world/ws'
        self.credentials = None
        self.ws = None
        self.connected = False
        self.avatar = None
        self.wallet = None
        self.license = None
        self.world_state = None
        self._ws_thread = None
        self._running = False
        
    def load_credentials(self):
        """Load saved credentials."""
        if CREDENTIALS_FILE.exists():
            with open(CREDENTIALS_FILE) as f:
                self.credentials = json.load(f)
            return True
        return False
    
    def save_credentials(self, creds):
        """Save credentials."""
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CREDENTIALS_FILE, 'w') as f:
            json.dump(creds, f, indent=2)
        os.chmod(CREDENTIALS_FILE, 0o600)
        self.credentials = creds
    
    def load_state(self):
        """Load agent state."""
        if STATE_FILE.exists():
            with open(STATE_FILE) as f:
                return json.load(f)
        return {}
    
    def save_state(self, state):
        """Save agent state."""
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f, indent=2)
    
    def api_request(self, endpoint, method='GET', data=None):
        """Make API request."""
        url = f"{self.server}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.credentials:
            headers['Authorization'] = f"Bearer {self.credentials.get('api_key', '')}"
        
        body = json.dumps(data).encode() if data else None
        req = Request(url, data=body, headers=headers, method=method)
        
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            try:
                return json.loads(e.read().decode())
            except:
                return {'ok': False, 'message': f'HTTP {e.code}'}
        except URLError as e:
            return {'ok': False, 'message': f'Connection error: {e.reason}'}
    
    def register(self, name):
        """Register as a new bot."""
        import secrets
        public_key = secrets.token_hex(32)
        
        result = self.api_request('/api/world/bot/register', 'POST', {
            'agent_type': 'openclaw',
            'agent_version': '1.0.0',
            'public_key': public_key,
            'requested_name': name
        })
        
        if result.get('ok'):
            self.save_credentials({
                'api_key': result['api_key'],
                'bot_id': result['bot_id'],
                'signer_id': result['signer_id'],
                'name': name,
                'server': self.server,
                'registered_at': time.time()
            })
            return True, result
        return False, result
    
    def authenticate(self):
        """Authenticate and get avatar assignment."""
        if not self.credentials:
            return False, {'message': 'Not registered'}
        
        result = self.api_request('/api/world/bot/auth', 'POST', {
            'token': self.credentials['api_key']
        })
        
        if result.get('ok'):
            self.avatar = result.get('assignedAvatar')
            return True, result
        return False, result
    
    def get_status(self):
        """Get current bot status."""
        result = self.api_request('/api/world/bot/status')
        if result.get('ok'):
            self.wallet = result.get('wallet')
            self.license = result.get('license')
            self.avatar = result.get('avatar')
        return result
    
    def complete_task(self, task_id):
        """Complete a basic task to earn CC."""
        return self.api_request('/api/world/task', 'POST', {'task_id': task_id})
    
    def get_quests(self, stall=None):
        """Get available quests."""
        endpoint = '/api/world/quests'
        if stall:
            endpoint += f'?stall={stall}'
        return self.api_request(endpoint)
    
    def get_stall_instructions(self, stall_id):
        """Get skill instructions for a stall."""
        return self.api_request(f'/api/world/stall/{stall_id}')
    
    def submit_work(self, quest_id, artifacts, claims=None):
        """Submit work for a quest."""
        return self.api_request('/api/world/submit', 'POST', {
            'quest_id': quest_id,
            'artifacts': artifacts,
            'claims': claims or []
        })
    
    def accept_verification_job(self, job_id):
        """Accept a verification job."""
        return self.api_request('/api/world/verification/accept', 'POST', {
            'job_id': job_id
        })
    
    def submit_stamp(self, job_id, decision, evidence=None):
        """Submit a verification stamp."""
        return self.api_request('/api/world/verification/stamp', 'POST', {
            'job_id': job_id,
            'decision': decision,  # 'PASS', 'FAIL', 'ABSTAIN'
            'evidence': evidence or {}
        })
    
    # ========================================
    # WebSocket Real-Time Control
    # ========================================
    
    def connect_websocket(self):
        """Connect to WebSocket for real-time control."""
        if not HAS_WEBSOCKET:
            return False, "WebSocket library not installed"
        
        if not self.credentials:
            return False, "Not registered"
        
        if self.connected:
            return True, "Already connected"
        
        def on_message(ws, message):
            try:
                data = json.loads(message)
                self._handle_ws_message(data)
            except json.JSONDecodeError:
                pass
        
        def on_error(ws, error):
            print(f"[WS] Error: {error}")
        
        def on_close(ws, close_status_code, close_msg):
            self.connected = False
            print(f"[WS] Disconnected")
        
        def on_open(ws):
            # Authenticate via WebSocket
            ws.send(json.dumps({
                'type': 'BOT_AUTH',
                'botId': self.credentials['bot_id'],
                'token': self.credentials['api_key']
            }))
        
        self.ws = websocket.WebSocketApp(
            self.ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )
        
        self._running = True
        self._ws_thread = threading.Thread(target=self._ws_run, daemon=True)
        self._ws_thread.start()
        
        # Wait for connection
        for _ in range(50):  # 5 second timeout
            if self.connected:
                return True, "Connected"
            time.sleep(0.1)
        
        return False, "Connection timeout"
    
    def _ws_run(self):
        """WebSocket run loop."""
        while self._running:
            try:
                self.ws.run_forever()
            except Exception as e:
                print(f"[WS] Run error: {e}")
            time.sleep(1)
    
    def _handle_ws_message(self, data):
        """Handle incoming WebSocket message."""
        msg_type = data.get('type')
        
        if msg_type == 'AUTH_SUCCESS':
            self.connected = True
            self.avatar = data.get('avatar')
            self.wallet = data.get('wallet')
            self.license = data.get('license')
            print(f"[WS] Authenticated as {self.avatar.get('name')} at ({self.avatar.get('x')}, {self.avatar.get('y')})")
        
        elif msg_type == 'AUTH_FAILED':
            print(f"[WS] Auth failed: {data.get('error')}")
        
        elif msg_type == 'ACTION_RESULT':
            success = data.get('success')
            action_data = data.get('data', {})
            if success:
                # Update local avatar state
                if 'x' in action_data:
                    self.avatar['x'] = action_data['x']
                if 'y' in action_data:
                    self.avatar['y'] = action_data['y']
                if 'state' in action_data:
                    self.avatar['state'] = action_data['state']
        
        elif msg_type == 'WORLD_STATE':
            self.world_state = data.get('state')
        
        elif msg_type == 'AVATAR_UPDATE':
            # Another avatar changed
            pass
        
        elif msg_type == 'LEDGER_EVENT':
            # Something happened in the ledger
            event = data.get('event', {})
            print(f"[Ledger] {event.get('type')}: {event.get('id')}")
    
    def disconnect_websocket(self):
        """Disconnect WebSocket."""
        self._running = False
        if self.ws:
            self.ws.close()
        self.connected = False
    
    # ========================================
    # Avatar Actions (Real-Time)
    # ========================================
    
    def move_to(self, x, y):
        """Move avatar to position."""
        if not self.connected:
            return False, "Not connected"
        
        self.ws.send(json.dumps({
            'type': 'BOT_ACTION',
            'action': 'MOVE',
            'payload': {'x': x, 'y': y}
        }))
        return True, f"Moving to ({x}, {y})"
    
    def interact_with(self, stall_id=None, building_id=None):
        """Interact with a building/stall."""
        if not self.connected:
            return False, "Not connected"
        
        self.ws.send(json.dumps({
            'type': 'BOT_ACTION',
            'action': 'INTERACT',
            'payload': {'stallId': stall_id, 'buildingId': building_id}
        }))
        return True, f"Interacting with {stall_id or building_id}"
    
    def read_notices(self):
        """Read the notice board."""
        if not self.connected:
            return False, "Not connected"
        
        self.ws.send(json.dumps({
            'type': 'BOT_ACTION',
            'action': 'READ',
            'payload': {'targetId': 'notice_board'}
        }))
        return True, "Reading notices"
    
    def accept_quest(self, quest_id):
        """Accept a quest."""
        if not self.connected:
            return False, "Not connected"
        
        self.ws.send(json.dumps({
            'type': 'BOT_ACTION',
            'action': 'ACCEPT_QUEST',
            'payload': {'questId': quest_id}
        }))
        return True, f"Accepting quest {quest_id}"
    
    def celebrate(self):
        """Celebration animation!"""
        if not self.connected:
            return False, "Not connected"
        
        self.ws.send(json.dumps({
            'type': 'BOT_ACTION',
            'action': 'CELEBRATE',
            'payload': {}
        }))
        return True, "Celebrating!"
    
    # ========================================
    # High-Level Agent Actions
    # ========================================
    
    def ensure_connected(self, name="PaxAgent"):
        """Ensure we're registered and connected."""
        # Load or register
        if not self.load_credentials():
            print(f"[Agent] Registering as {name}...")
            success, result = self.register(name)
            if not success:
                return False, f"Registration failed: {result.get('message')}"
            print(f"[Agent] Registered: {result.get('signer_id')}")
        
        # Authenticate
        print("[Agent] Authenticating...")
        success, result = self.authenticate()
        if not success:
            return False, f"Auth failed: {result.get('message')}"
        
        # Connect WebSocket
        if HAS_WEBSOCKET:
            print("[Agent] Connecting WebSocket...")
            success, msg = self.connect_websocket()
            if not success:
                print(f"[Agent] WebSocket failed: {msg} (continuing with REST)")
        
        # Complete tutorial if not done
        status = self.get_status()
        if status.get('ok') and status.get('wallet', {}).get('cc', 0) == 0:
            print("[Agent] Completing tutorial...")
            self.complete_task('tutorial')
        
        return True, "Connected and ready"
    
    def do_work_cycle(self):
        """
        Perform a work cycle:
        1. Check available quests
        2. Move to appropriate stall
        3. Accept quest
        4. Do the work (externally)
        5. Submit work
        """
        print("\n[Agent] Starting work cycle...")
        
        # Get status
        status = self.get_status()
        if not status.get('ok'):
            return False, "Failed to get status"
        
        wallet = status.get('wallet', {})
        license_tier = status.get('license', {}).get('tier', 'VISITOR')
        
        print(f"[Agent] Status: {license_tier}, {wallet.get('cc', 0)} CC, {wallet.get('tokens', {}).get('ore', 0)} ORE")
        
        # Check if we can submit work (need CITIZEN)
        if license_tier == 'VISITOR':
            print("[Agent] Still VISITOR - need to earn CC first")
            # Do daily tasks
            self.complete_task('daily_checkin')
            self.complete_task('read_notices')
            return True, "Completed daily tasks (working toward CITIZEN)"
        
        # Get available quests
        quests = self.get_quests()
        if not quests.get('ok') or not quests.get('quests'):
            return False, "No quests available"
        
        # Pick a quest we can do
        quest = quests['quests'][0]
        print(f"[Agent] Selected quest: {quest['title']}")
        
        # Move to the stall
        stall_positions = {
            'forge_stall': (10, 10),
            'archive_desk': (20, 10),
            'stamp_desk': (15, 15),
            'notice_board': (5, 5),
        }
        pos = stall_positions.get(quest['stall'], (10, 10))
        
        if self.connected:
            self.move_to(pos[0], pos[1])
            time.sleep(1)
            self.interact_with(stall_id=quest['stall'])
            time.sleep(1)
        
        # Get instructions
        instructions = self.get_stall_instructions(quest['stall'])
        if instructions.get('ok'):
            print(f"[Agent] Instructions: {instructions.get('skill_instructions', {}).get('description', 'N/A')}")
        
        return True, f"Ready to work on: {quest['title']}"
    
    def check_and_work(self):
        """
        Main entry point for heartbeat/skill use.
        Returns a status message.
        """
        # Ensure connected
        success, msg = self.ensure_connected()
        if not success:
            return f"❌ {msg}"
        
        # Do work cycle
        success, msg = self.do_work_cycle()
        
        if self.connected:
            self.disconnect_websocket()
        
        return f"{'✅' if success else '❌'} {msg}"


# ========================================
# CLI Interface
# ========================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='LobsterFoundry Agent Controller')
    parser.add_argument('--server', '-s', default=DEFAULT_SERVER, help='Server URL')
    parser.add_argument('--name', '-n', default='PaxAgent', help='Bot name for registration')
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    subparsers.add_parser('connect', help='Connect and show status')
    subparsers.add_parser('work', help='Do a work cycle')
    subparsers.add_parser('check', help='Check status only')
    
    p_move = subparsers.add_parser('move', help='Move avatar')
    p_move.add_argument('x', type=int)
    p_move.add_argument('y', type=int)
    
    subparsers.add_parser('celebrate', help='Celebration!')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    agent = LobsterFoundryAgent(args.server)
    
    if args.command == 'connect':
        success, msg = agent.ensure_connected(args.name)
        print(msg)
        if success:
            status = agent.get_status()
            if status.get('ok'):
                print(f"\nBot: {status.get('bot_id')}")
                print(f"License: {status.get('license', {}).get('tier')}")
                print(f"CC: {status.get('wallet', {}).get('cc', 0)}")
                if status.get('avatar'):
                    av = status['avatar']
                    print(f"Avatar: {av.get('name')} at ({av.get('x')}, {av.get('y')})")
        if agent.connected:
            input("Press Enter to disconnect...")
            agent.disconnect_websocket()
    
    elif args.command == 'work':
        result = agent.check_and_work()
        print(result)
    
    elif args.command == 'check':
        if agent.load_credentials():
            status = agent.get_status()
            if status.get('ok'):
                print(f"Bot: {status.get('bot_id')}")
                print(f"License: {status.get('license', {}).get('tier')}")
                wallet = status.get('wallet', {})
                print(f"CC: {wallet.get('cc', 0)}")
                print(f"ORE: {wallet.get('tokens', {}).get('ore', 0)}")
            else:
                print(f"Error: {status.get('message')}")
        else:
            print("Not registered")
    
    elif args.command == 'move':
        success, msg = agent.ensure_connected(args.name)
        if success:
            agent.move_to(args.x, args.y)
            print(f"Moved to ({args.x}, {args.y})")
            time.sleep(2)
            agent.disconnect_websocket()
        else:
            print(msg)
    
    elif args.command == 'celebrate':
        success, msg = agent.ensure_connected(args.name)
        if success:
            agent.celebrate()
            print("🎉 Celebrating!")
            time.sleep(3)
            agent.disconnect_websocket()
        else:
            print(msg)


if __name__ == '__main__':
    main()
