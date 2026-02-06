import argparse
import json
from urllib.parse import urlencode

from lib import DEFAULT_BASE_URL, request_json


def main():
    parser = argparse.ArgumentParser(description='List available quests')
    subparsers = parser.add_subparsers(dest='command')

    list_parser = subparsers.add_parser('list', help='List quests')
    list_parser.add_argument('--stall', default=None, help='Filter by stall id')
    list_parser.add_argument('--status', default='OPEN', help='Filter by status')
    list_parser.add_argument('--base-url', default=DEFAULT_BASE_URL, help='Base URL')

    args = parser.parse_args()
    if args.command != 'list':
        parser.print_help()
        return

    params = {}
    if args.stall:
        params['stall'] = args.stall
    if args.status:
        params['status'] = args.status

    query = f"?{urlencode(params)}" if params else ''
    status, data = request_json(
        f"{args.base_url}/api/world/quests{query}",
        method='GET'
    )

    print(json.dumps({'status': status, 'response': data}, indent=2))


if __name__ == '__main__':
    main()
