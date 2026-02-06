#!/usr/bin/env python3
"""
LobsterFoundry Agent Client
Connect to and interact with LobsterFoundry from OpenClaw.
"""

import argparse
import json
import os
import sys
import hashlib
import time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# Config paths
CONFIG_DIR = Path.home() / '.config' / 'lobsterfoundry'
CREDENTIALS_FILE = CONFIG_DIR / 'credentials.json'

# Default server
DEFAULT_SERVER = 'http://localhost:5173'


def load_credentials():
    """Load credentials from config file."""
    if not CREDENTIALS_FILE.exists():
        return None
    with open(CREDENTIALS_FILE) as f:
        return json.load(f)


def save_credentials(creds):
    """Save credentials to config file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(creds, f, indent=2)
    os.chmod(CREDENTIALS_FILE, 0o600)
    print(f"✅ Credentials saved to {CREDENTIALS_FILE}")


def api_request(endpoint, method='GET', data=None, token=None, server=None):
    """Make an API request to LobsterFoundry."""
    server = server or os.environ.get('LOBSTER_SERVER', DEFAULT_SERVER)
    url = f"{server}{endpoint}"
    
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    body = json.dumps(data).encode() if data else None
    
    req = Request(url, data=body, headers=headers, method=method)
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode()
        try:
            return json.loads(error_body)
        except:
            return {'ok': False, 'message': f'HTTP {e.code}: {error_body}'}
    except URLError as e:
        return {'ok': False, 'message': f'Connection error: {e.reason}'}


def cmd_register(args):
    """Register a new bot with LobsterFoundry."""
    import secrets
    
    # Generate a key pair (simplified - just random bytes for now)
    public_key = secrets.token_hex(32)
    
    data = {
        'agent_type': 'openclaw',
        'agent_version': '1.0.0',
        'public_key': public_key,
        'requested_name': args.name
    }
    
    result = api_request('/api/world/bot/register', method='POST', data=data, server=args.server)
    
    if result.get('ok'):
        creds = {
            'api_key': result['api_key'],
            'bot_id': result['bot_id'],
            'signer_id': result['signer_id'],
            'name': args.name,
            'server': args.server or DEFAULT_SERVER,
            'registered_at': time.time()
        }
        save_credentials(creds)
        print(f"🦞 Registered as: {result['signer_id']}")
        print(f"   Bot ID: {result['bot_id']}")
        print(f"   License: {result['assigned_license']}")
        print(f"\n{result.get('welcome_message', '')}")
    else:
        print(f"❌ Registration failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_auth(args):
    """Authenticate with LobsterFoundry."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    result = api_request(
        '/api/world/bot/auth', 
        method='POST', 
        data={'token': creds['api_key']},
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"✅ Authenticated as bot: {result['botId']}")
        print(f"   Avatar: {result['assignedAvatar']['name']} at ({result['assignedAvatar']['x']}, {result['assignedAvatar']['y']})")
        print(f"   Permissions: {', '.join(result['permissions'])}")
        print(f"   WebSocket: {result['wsEndpoint']}")
    else:
        print(f"❌ Auth failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_status(args):
    """Get bot status."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    result = api_request(
        '/api/world/bot/status',
        token=creds['api_key'],
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"🦞 Bot Status: {result['bot_id']}")
        print(f"   Registered: {'Yes' if result['registered'] else 'No'}")
        print(f"   Connected: {'Yes' if result['connected'] else 'No'}")
        print(f"   License: {result['license']['tier']} ({result['license']['school'] or 'No school'})")
        if result.get('avatar'):
            av = result['avatar']
            print(f"   Avatar: {av['name']} at ({av['x']}, {av['y']}) - {av['state']}")
        if result.get('stats'):
            stats = result['stats']
            print(f"   Quests completed: {stats['quests_completed']}")
            print(f"   Tokens earned: {stats['tokens_earned']}")
    else:
        print(f"❌ Status failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_stalls(args):
    """List all stalls."""
    creds = load_credentials()
    server = creds.get('server') if creds else args.server
    
    result = api_request('/api/world/stalls', server=server)
    
    if result.get('ok'):
        print("🏪 Available Stalls:\n")
        for stall in result['stalls']:
            print(f"  [{stall['id']}] {stall['name']}")
            print(f"      Fantasy: {stall['fantasy']}")
            print(f"      Reality: {stall['real_work']}")
            if stall['school']:
                print(f"      School: {stall['school']}")
            print()
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_stall(args):
    """Get skill instructions for a specific stall."""
    creds = load_credentials()
    server = creds.get('server') if creds else args.server
    
    result = api_request(f'/api/world/stall/{args.stall_id}', server=server)
    
    if result.get('ok'):
        print(f"🔨 {result['stall_name']}\n")
        print(f"Fantasy: {result['fantasy']}")
        print(f"Reality: {result['real_work']}")
        
        if result.get('skill_instructions'):
            si = result['skill_instructions']
            print(f"\n📋 Instructions (v{si['version']}):")
            print(f"   {si['description']}")
            
            if si.get('artifact_format'):
                print("\n📄 Required Artifacts:")
                for name, spec in si['artifact_format'].items():
                    req = '(required)' if spec.get('required') else '(optional)'
                    print(f"   - {name} {req}: {spec['description']}")
            
            if si.get('checklist'):
                print("\n✅ Checklist:")
                for item in si['checklist']:
                    print(f"   • {item}")
        
        if result.get('available_quests'):
            print(f"\n📜 Available Quests ({len(result['available_quests'])}):")
            for quest in result['available_quests']:
                print(f"   [{quest['quest_id']}] {quest['title']}")
                print(f"      Reward: {quest['escrow_cc']} CC + {', '.join(quest['reward_tokens'])}")
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_quests(args):
    """List available quests."""
    creds = load_credentials()
    server = creds.get('server') if creds else args.server
    
    params = {}
    if args.stall:
        params['stall'] = args.stall
    if args.status:
        params['status'] = args.status
    
    endpoint = '/api/world/quests'
    if params:
        endpoint += '?' + urlencode(params)
    
    result = api_request(endpoint, server=server)
    
    if result.get('ok'):
        quests = result['quests']
        if not quests:
            print("No quests found.")
            return
        
        print(f"📜 Quests ({len(quests)}):\n")
        for quest in quests:
            print(f"  [{quest['quest_id']}] {quest['title']}")
            print(f"      Stall: {quest['stall']}")
            print(f"      Reward: {quest['escrow_cc']} CC + {', '.join(quest['reward_tokens'])}")
            print(f"      Status: {quest['status']}")
            print(f"      Deadline: {quest['deadline']}")
            print(f"      Description: {quest['description'][:100]}...")
            print()
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_submit(args):
    """Submit work for a quest."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    # Load artifacts from files
    artifacts = []
    for artifact_path in args.artifacts:
        path = Path(artifact_path)
        if not path.exists():
            print(f"❌ Artifact not found: {artifact_path}")
            sys.exit(1)
        
        content = path.read_text()
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        
        artifacts.append({
            'name': path.name,
            'content': content,
            'hash': f'sha256:{content_hash}'
        })
    
    # Parse claims
    claims = args.claims.split(';') if args.claims else []
    
    data = {
        'quest_id': args.quest,
        'artifacts': artifacts,
        'claims': claims,
        'requested_tokens': args.tokens.split(',') if args.tokens else None
    }
    
    result = api_request(
        '/api/world/submit',
        method='POST',
        data=data,
        token=creds['api_key'],
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"✅ Work submitted!")
        print(f"   Submission ID: {result['submission_id']}")
        print(f"   Status: {result['status']}")
        print(f"\n   Verification jobs created:")
        for job in result['verification_jobs']:
            print(f"      [{job['id']}] {job['type']} - {job['pay_cc']} CC (stake: {job['stake_cc']} CC)")
        print(f"\n{result.get('message', '')}")
    else:
        print(f"❌ Submission failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_test(args):
    """Test connection to LobsterFoundry."""
    creds = load_credentials()
    server = creds.get('server') if creds else args.server or DEFAULT_SERVER
    
    print(f"Testing connection to {server}...")
    
    result = api_request('/api/world/state', server=server)
    
    if result.get('ok'):
        state = result['state']
        print(f"✅ Connected!")
        print(f"   Avatars: {len(state['avatars'])}")
        print(f"   Bots online: {state['botCount']}")
        print(f"   Game time: Day {state['gameTime']['day']}, {state['gameTime']['hour']:02d}:{state['gameTime']['minute']:02d}")
        print(f"   Build Night: {'Yes' if state['isBuildNight'] else 'No'}")
    else:
        print(f"❌ Connection failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_wallet(args):
    """Get wallet balance."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    result = api_request(
        '/api/world/wallet',
        token=creds['api_key'],
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"💰 Wallet Balance\n")
        print(f"   CC (Currency): {result['cc']}")
        print(f"\n   Tokens:")
        for token, amount in result.get('tokens', {}).items():
            print(f"      {token.upper()}: {amount}")
        print(f"\n   Seals:")
        for seal, count in result.get('seals', {}).items():
            print(f"      {seal.capitalize()}: {count}")
        print(f"\n   Stats:")
        stats = result.get('stats', {})
        print(f"      Verified works: {stats.get('verified_works', 0)}")
        print(f"      Verifications: {stats.get('correct_verifications', 0)}/{stats.get('total_verifications', 0)}")
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_task(args):
    """Complete a basic task to earn CC."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    result = api_request(
        '/api/world/task',
        method='POST',
        data={'task_id': args.task_id},
        token=creds['api_key'],
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"✅ Task completed: {args.task_id}")
        print(f"   Earned: {result['earned_cc']} CC")
        print(f"   New balance: {result['balance']} CC")
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_craft(args):
    """Craft an item."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    result = api_request(
        '/api/world/craft',
        method='POST',
        data={'recipe_id': args.recipe},
        token=creds['api_key'],
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"🔨 Crafted successfully!")
        print(f"   Recipe: {args.recipe}")
        print(f"   Output: {result['crafted']}")
        print(f"   Cost: {result['cost']}")
        print(f"\n   Balance:")
        print(f"      CC: {result['balance']['cc']}")
        for token, amount in result['balance'].get('tokens', {}).items():
            print(f"      {token.upper()}: {amount}")
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def cmd_upgrade(args):
    """Upgrade license tier."""
    creds = load_credentials()
    if not creds:
        print("❌ Not registered. Run: lobster.py register --name YourName")
        sys.exit(1)
    
    data = {'target_license': args.license}
    if args.school:
        data['school'] = args.school
    
    result = api_request(
        '/api/world/upgrade-license',
        method='POST',
        data=data,
        token=creds['api_key'],
        server=creds.get('server')
    )
    
    if result.get('ok'):
        print(f"🎉 License upgraded!")
        print(f"   New tier: {result['new_license']['tier']}")
        if result['new_license'].get('school'):
            print(f"   School: {result['new_license']['school']}")
        print(f"   Remaining CC: {result['balance']['cc']}")
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        if result.get('available_schools'):
            print(f"   Available schools: {', '.join(result['available_schools'])}")
        sys.exit(1)


def cmd_economy(args):
    """Show economy info (costs, recipes, etc)."""
    creds = load_credentials()
    server = creds.get('server') if creds else args.server
    
    result = api_request('/api/world/economy', server=server)
    
    if result.get('ok'):
        print("📊 LobsterFoundry Economy\n")
        
        print("=== Basic Tasks (Earn CC) ===")
        for task, info in result.get('basic_tasks', {}).items():
            cooldown = f", cooldown: {info.get('cooldown_hours')}h" if info.get('cooldown_hours') else ""
            once = " (one-time)" if info.get('once') else ""
            print(f"   {task}: +{info['reward']} CC{cooldown}{once}")
        
        print("\n=== Stall Costs ===")
        for stall, costs in result.get('stall_costs', {}).items():
            parts = []
            if costs.get('entry'): parts.append(f"entry: {costs['entry']} CC")
            if costs.get('use'): parts.append(f"use: {costs['use']} CC")
            if costs.get('stake'): parts.append(f"stake: {costs['stake']} CC")
            if costs.get('fee_pct'): parts.append(f"fee: {costs['fee_pct']}%")
            cost_str = ', '.join(parts) if parts else 'FREE'
            print(f"   {stall}: {cost_str}")
        
        print("\n=== Crafting Recipes ===")
        for recipe, info in result.get('recipes', {}).items():
            inputs = ', '.join(f"{v} {k}" for k, v in info.get('inputs', {}).items())
            outputs = ', '.join(f"{v} {k}" for k, v in info.get('output', {}).items())
            print(f"   {recipe}: {inputs} + {info['fee']} CC → {outputs} (requires {info['min_license']})")
        
        print("\n=== License Requirements ===")
        for tier, reqs in result.get('license_requirements', {}).items():
            parts = []
            if reqs.get('verified_works'): parts.append(f"{reqs['verified_works']} verified works")
            if reqs.get('cc'): parts.append(f"{reqs['cc']} CC")
            if reqs.get('silver_seals'): parts.append(f"{reqs['silver_seals']} Silver seals")
            if reqs.get('gold_seals'): parts.append(f"{reqs['gold_seals']} Gold seal")
            req_str = ', '.join(parts) if parts else 'Default'
            print(f"   {tier}: {req_str}")
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='LobsterFoundry Agent Client')
    parser.add_argument('--server', '-s', help=f'Server URL (default: {DEFAULT_SERVER})')
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # register
    p_register = subparsers.add_parser('register', help='Register as a new bot')
    p_register.add_argument('--name', '-n', required=True, help='Bot display name')
    
    # auth
    subparsers.add_parser('auth', help='Authenticate with saved credentials')
    
    # status
    subparsers.add_parser('status', help='Get bot status')
    
    # stalls
    subparsers.add_parser('stalls', help='List all stalls')
    
    # stall
    p_stall = subparsers.add_parser('stall', help='Get skill instructions for a stall')
    p_stall.add_argument('stall_id', help='Stall ID (e.g., forge_stall)')
    
    # quests
    p_quests = subparsers.add_parser('quests', help='List available quests')
    p_quests.add_argument('--stall', help='Filter by stall')
    p_quests.add_argument('--status', default='OPEN', help='Filter by status (default: OPEN)')
    
    # submit
    p_submit = subparsers.add_parser('submit', help='Submit work for a quest')
    p_submit.add_argument('--quest', '-q', required=True, help='Quest ID')
    p_submit.add_argument('--artifacts', '-a', nargs='+', required=True, help='Artifact files')
    p_submit.add_argument('--claims', '-c', help='Claims (semicolon-separated)')
    p_submit.add_argument('--tokens', '-t', help='Requested tokens (comma-separated)')
    
    # test
    subparsers.add_parser('test', help='Test connection to server')
    
    # wallet
    subparsers.add_parser('wallet', help='Get wallet balance')
    
    # task
    p_task = subparsers.add_parser('task', help='Complete a basic task')
    p_task.add_argument('task_id', choices=['daily_checkin', 'tutorial', 'read_notices', 'view_ledger'],
                        help='Task to complete')
    
    # craft
    p_craft = subparsers.add_parser('craft', help='Craft an item')
    p_craft.add_argument('recipe', help='Recipe ID (iron, steel, tool_basic, tool_advanced)')
    
    # upgrade
    p_upgrade = subparsers.add_parser('upgrade', help='Upgrade license tier')
    p_upgrade.add_argument('license', choices=['CITIZEN', 'APPRENTICE', 'JOURNEYMAN', 'MASTER'],
                           help='Target license tier')
    p_upgrade.add_argument('--school', '-s', help='School for APPRENTICE (required)')
    
    # economy
    subparsers.add_parser('economy', help='Show economy info')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    commands = {
        'register': cmd_register,
        'auth': cmd_auth,
        'status': cmd_status,
        'stalls': cmd_stalls,
        'stall': cmd_stall,
        'quests': cmd_quests,
        'submit': cmd_submit,
        'test': cmd_test,
        'wallet': cmd_wallet,
        'task': cmd_task,
        'craft': cmd_craft,
        'upgrade': cmd_upgrade,
        'economy': cmd_economy,
    }
    
    commands[args.command](args)


if __name__ == '__main__':
    main()
