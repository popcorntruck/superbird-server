import type { Image } from "@spotify/web-api-ts-sdk";
import { mapFirstOr } from "./utils";

export function selectImageIdFromList(imageList: Image[]) {
  return extractImageIdFromUrl(mapFirstOr(imageList, (image) => image.url, ""));
}

export function extractImageIdFromUrl(url: string) {
  return url.replace("https://i.scdn.co/image/", "");
}

export function getUrlFromImageId(imageId: string) {
  return `https://i.scdn.co/image/${imageId}`;
}

export async function fetchImage(imageId: string) {
  return fetch(getUrlFromImageId(imageId)).then((res) => res.arrayBuffer());
}

export async function getImageBase64(imageId: string) {
  const cachedImage = await getCachedImage(imageId);

  if (cachedImage) {
    return Buffer.from(cachedImage).toString("base64");
  }

  const imageBuffer = await fetchImage(imageId);
  await cacheImage(imageId, imageBuffer);
  return Buffer.from(imageBuffer).toString("base64");
}

// 99% sure they are all jpegs
const cachedImgRef = (imageId: string) => Bun.file(`./cache/${imageId}.jpg`);

async function cacheImage(imageId: string, imageBuffer: ArrayBuffer) {
  const file = cachedImgRef(imageId);

  const numBytes = await Bun.write(file, imageBuffer);

  return { numBytes, file };
}

async function getCachedImage(imageId: string) {
  const file = cachedImgRef(imageId);
  const exists = await file.exists();

  if (!exists) {
    return null;
  }

  const buffer = await file.arrayBuffer();

  return buffer;
}
