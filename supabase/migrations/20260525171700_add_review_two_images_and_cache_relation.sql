-- Add explicit columns for the two-image before-and-after reviews
ALTER TABLE public.cakegenie_reviews 
ADD COLUMN IF NOT EXISTS original_image_url TEXT,
ADD COLUMN IF NOT EXISTS finished_image_url TEXT;

COMMENT ON COLUMN public.cakegenie_reviews.original_image_url IS 'The reference design image uploaded by the customer';
COMMENT ON COLUMN public.cakegenie_reviews.finished_image_url IS 'The final finished cake image uploaded by the merchant';

-- Add foreign key linking cakegenie_reviews to cakegenie_analysis_cache(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_cakegenie_reviews_analysis_cache' AND table_name = 'cakegenie_reviews'
    ) THEN
        ALTER TABLE public.cakegenie_reviews
        ADD CONSTRAINT fk_cakegenie_reviews_analysis_cache
        FOREIGN KEY (product_id) 
        REFERENCES public.cakegenie_analysis_cache(id)
        ON DELETE SET NULL;
    END IF;
END $$;
