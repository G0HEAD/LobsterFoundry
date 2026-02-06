import argparse
import json

from lib import DEFAULT_BASE_URL, request_json


def main():
    parser = argparse.ArgumentParser(description='Authenticate a bot and fetch avatar assignment')
    parser.add_argument('--api-key', required=True, help='Bot API key')
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL, help='Base URL')
    args = parser.parse_args()

    payload = {
        'token': args.api_key,
        'clientType': 'openclaw',
        'version': '1.0.0'
    }

    status, data = request_json(
        f"{args.base_url}/api/world/bot/auth",
        method='POST',
        body=payload,
        headers={'Authorization': f"Bearer {args.api_key}"}
    )

    print(json.dumps({'status': status, 'response': data}, indent=2))


if __name__ == '__main__':
    main()
