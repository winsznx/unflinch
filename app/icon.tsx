import { ImageResponse } from "next/og";

import { Mark } from "@/components/brand/Logo";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          borderRadius: 8,
        }}
      >
        <Mark size={26} />
      </div>
    ),
    size,
  );
}
