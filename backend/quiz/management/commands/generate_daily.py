"""Pre-generate (or backfill) a daily quiz.

Generation is normally lazy (first API hit of the day), but this lets you
pre-build today's or a specific date's quiz, e.g. from cron.

    python manage.py generate_daily             # today
    python manage.py generate_daily 2026-06-10  # a specific date
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from quiz import services


class Command(BaseCommand):
    help = 'Generate the daily quiz for today (or a given YYYY-MM-DD).'

    def add_arguments(self, parser):
        parser.add_argument('date', nargs='?', help='YYYY-MM-DD (default: today)')

    def handle(self, *args, **options):
        if options.get('date'):
            try:
                d = datetime.strptime(options['date'], '%Y-%m-%d').date()
            except ValueError:
                raise CommandError('Date must be YYYY-MM-DD.')
        else:
            d = services.today()

        quiz = services.get_or_create_quiz(d)
        self.stdout.write(self.style.SUCCESS(
            f'Daily quiz for {quiz.date}: {quiz.questions.count()} questions '
            f'(seed {quiz.seed}).'
        ))
