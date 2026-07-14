/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

// Define the type for params explicitly
type RouteParams = {
  params: Promise<{ storeId: string }>;
};

// Define the expected shape of a variation in the POST request body
interface VariationInput {
  sizeId?: string;
  colorId?: string;
  price: number;
  stock?: number;
  images?: { url: string }[];
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { storeId } = await params;
    const { userId } = await auth();
    const body = await req.json();

    const {
      name,
      description,
      categoryId,
      variations,
      isFeatured,
      isArchived,
    } = body as {
      name: string;
      description?: string;
      categoryId: string;
      variations: VariationInput[];
      isFeatured?: boolean;
      isArchived?: boolean;
    };

    if (!userId) return new NextResponse("Unauthenticated", { status: 403 });
    if (!name) return new NextResponse("Name is required", { status: 400 });
    if (!categoryId) return new NextResponse("Category id is required", { status: 400 });
    if (!variations || !variations.length) return new NextResponse("At least one variation is required", { status: 400 });
    if (!storeId) return new NextResponse("Store id is required", { status: 400 });

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });
    if (!storeByUserId) return new NextResponse("Unauthorized", { status: 405 });

    const now = new Date();

    const product = await prismadb.product.create({
      data: {
        name,
        description: description ?? "",
        isFeatured: isFeatured ?? false,
        isArchived: isArchived ?? false,
        categoryId,
        storeId,
        createdAt: now,
        updatedAt: now,
        variations: {
          create: variations.map((variation) => ({
            sizeId: variation.sizeId ?? null,
            colorId: variation.colorId ?? null,
            price: variation.price,
            stock: variation.stock ?? null,
            createdAt: now,
            updatedAt: now,
            images: {
              create: variation.images?.map((image) => ({
                url: image.url,
                createdAt: now,
                updatedAt: now,
              })) || [],
            },
          })) as any,
        },
      },
      include: {
        variations: {
          include: {
            images: true,
            size: true,
            color: true,
          },
        },
        images: true,
        category: true,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("[PRODUCTS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    // Await the params to get storeId
    const { storeId } = await params;
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const isFeatured = searchParams.get("isFeatured");

    if (!storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const products = await prismadb.product.findMany({
      where: {
        storeId: storeId,
        categoryId,
        isFeatured: isFeatured ? true : undefined,
        isArchived: false,
      },
      include: {
        images: true,
        category: true,
        variations: { include: { size: true, color: true, images: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("[PRODUCTS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
