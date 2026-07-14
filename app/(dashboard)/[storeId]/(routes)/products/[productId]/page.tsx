import prismadb from "@/lib/prismadb";
import { ProductForm } from "./components/product-form";

// Define the type for params explicitly
type ProductPageProps = {
  params: Promise<{ productId: string; storeId: string }>;
};

const ProductPage = async ({ params }: ProductPageProps) => {
  // Await the params to get productId and storeId
  const { productId, storeId } = await params;

  const rawProduct =
    productId === "new"
      ? null
      : await prismadb.product.findUnique({
          where: { id: productId },
          include: {
            images: true,
            variations: {
              include: {
                images: true,
                size: true,
                color: true,
              },
            },
          },
        });

  const product = rawProduct
    ? {
        ...rawProduct,
        variations: rawProduct.variations,
      }
    : null;

  const categories = await prismadb.category.findMany({
    where: { storeId: storeId },
  });

  const sizes = await prismadb.size.findMany({
    where: { storeId: storeId },
  });

  const colors = await prismadb.color.findMany({
    where: { storeId: storeId },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductForm
          categories={categories}
          colors={colors}
          sizes={sizes}
          initialData={product}
        />
      </div>
    </div>
  );
};

export default ProductPage;
