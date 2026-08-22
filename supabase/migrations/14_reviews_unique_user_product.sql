-- Allow one review per user for each product.
create unique index if not exists idx_rated_product_user
  on rated(product_id, user_id);

create index if not exists idx_rated_product_created
  on rated(product_id, created_at desc);