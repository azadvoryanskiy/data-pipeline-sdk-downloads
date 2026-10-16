{% test no_missing_dates(model, group_by, date_column) %}
-- Every group must have a row for every day between its first and last day.
-- A missing file or a package dropped from one day's response shows up here.
select
    {{ group_by }},
    min({{ date_column }}) as first_day,
    max({{ date_column }}) as last_day,
    count(distinct {{ date_column }}) as days_present
from {{ model }}
group by {{ group_by }}
having count(distinct {{ date_column }}) <> date_diff('day', min({{ date_column }}), max({{ date_column }})) + 1
{% endtest %}
