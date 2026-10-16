{% test unique_combination_of_columns(model, columns) %}
-- Fails for every combination of the columns that appears more than once.
select {{ columns | join(', ') }}, count(*) as rows
from {{ model }}
group by {{ columns | join(', ') }}
having count(*) > 1
{% endtest %}
