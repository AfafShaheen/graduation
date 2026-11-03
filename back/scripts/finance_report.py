"""Financial totals per ceremony, for the person who is allowed to see them.

The admin dashboard is shared by several people, so it shows no money totals.
Run this on the server instead (it reads the same database as the application):

    docker compose exec back python -m scripts.finance_report
    docker compose exec back python -m scripts.finance_report --xlsx /tmp/finance.xlsx

Amounts are the ticket prices: "confirmed" tickets are money received,
"processing" tickets are payments still waiting for review.
"""
import argparse
import asyncio
from decimal import Decimal

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.event import EventModel
from app.models.ticket import TicketModel, TicketStatusEnum


async def collect() -> list[dict]:
    async with AsyncSessionLocal() as db:
        events = (await db.execute(select(EventModel).order_by(EventModel.event_date))).scalars().all()
        rows = []
        for ev in events:
            per_status = {
                status: (int(count), Decimal(total or 0))
                for status, count, total in (
                    await db.execute(
                        select(TicketModel.status, func.count(), func.sum(TicketModel.price))
                        .where(TicketModel.event_id == ev.id)
                        .group_by(TicketModel.status)
                    )
                ).all()
            }
            packages = (
                await db.execute(
                    select(TicketModel.companions_count, func.count(), func.sum(TicketModel.price))
                    .where(TicketModel.event_id == ev.id, TicketModel.status == TicketStatusEnum.CONFIRMED)
                    .group_by(TicketModel.companions_count)
                    .order_by(TicketModel.companions_count)
                )
            ).all()
            confirmed = per_status.get(TicketStatusEnum.CONFIRMED, (0, Decimal(0)))
            processing = per_status.get(TicketStatusEnum.PROCESSING, (0, Decimal(0)))
            rows.append(
                {
                    "event": ev.name,
                    "confirmed_tickets": confirmed[0],
                    "confirmed_amount": confirmed[1],
                    "processing_tickets": processing[0],
                    "processing_amount": processing[1],
                    "packages": [(int(c), int(n), Decimal(t or 0)) for c, n, t in packages],
                }
            )
        return rows


def print_report(rows: list[dict]) -> None:
    for r in rows:
        print(f"\n{r['event']}")
        print(f"  confirmed : {r['confirmed_tickets']:>5} tickets  {r['confirmed_amount']:>14,.2f}")
        print(f"  processing: {r['processing_tickets']:>5} tickets  {r['processing_amount']:>14,.2f}")
        for companions, tickets, amount in r["packages"]:
            print(f"    +{companions} companions: {tickets:>4} tickets  {amount:>12,.2f}")
    total = sum((r["confirmed_amount"] for r in rows), Decimal(0))
    print(f"\nTotal confirmed: {total:,.2f}")


def write_xlsx(rows: list[dict], path: str) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Ceremony", "Confirmed tickets", "Confirmed amount", "Processing tickets", "Processing amount"])
    for r in rows:
        ws.append([r["event"], r["confirmed_tickets"], float(r["confirmed_amount"]),
                   r["processing_tickets"], float(r["processing_amount"])])
    wb.save(path)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xlsx", help="also write the totals to this Excel file")
    args = parser.parse_args()
    rows = await collect()
    print_report(rows)
    if args.xlsx:
        write_xlsx(rows, args.xlsx)
        print(f"Saved {args.xlsx}")


if __name__ == "__main__":
    asyncio.run(main())
