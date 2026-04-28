
The sample response of /summary using open AI
```
{
    "summary": "Here's a friendly weekly spending summary tailored to you:\n\nYou spent a total of USD 545.89 across 6 transactions this week. The top spending category was travel, where you spent a significant USD 240.00 on a flight to NYC - that's your largest single expense of the week! Your other expenses covered accommodation, meals, transportation, and software needs. To stay on track, consider reviewing your budget to see if there's room for adjustments to help you save for future expenses, like that flight was a one-time cost.",
    "data": {
        "totalAmount": 545.89,
        "expenseCount": 6,
        "currency": "USD",
        "byCategory": [
            {
                "category": "travel",
                "total": 240,
                "count": 1
            },
            {
                "category": "accommodation",
                "total": 150,
                "count": 1
            },
            {
                "category": "meals",
                "total": 107.9,
                "count": 2
            },
            {
                "category": "transportation",
                "total": 35,
                "count": 1
            },
            {
                "category": "software",
                "total": 12.99,
                "count": 1
            }
        ],
        "largestExpense": {
            "description": "Flight to NYC",
            "amount": 240,
            "category": "travel"
        },
        "statusBreakdown": [
            {
                "status": "draft",
                "count": 6
            }
        ]
    }
}
```