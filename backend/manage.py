#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'drmariam.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    # Port 8000 is taken by Docker on this machine; the frontend expects 8001.
    from django.core.management.commands.runserver import Command as RunserverCommand
    RunserverCommand.default_port = '8001'
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
