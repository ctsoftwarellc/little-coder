from __future__ import annotations

import argparse
import os
import struct
from pathlib import Path


TYPE_UINT8 = 0
TYPE_INT8 = 1
TYPE_UINT16 = 2
TYPE_INT16 = 3
TYPE_UINT32 = 4
TYPE_INT32 = 5
TYPE_FLOAT32 = 6
TYPE_BOOL = 7
TYPE_STRING = 8
TYPE_ARRAY = 9
TYPE_UINT64 = 10
TYPE_INT64 = 11
TYPE_FLOAT64 = 12

SCALAR_SIZES = {
    TYPE_UINT8: 1,
    TYPE_INT8: 1,
    TYPE_UINT16: 2,
    TYPE_INT16: 2,
    TYPE_UINT32: 4,
    TYPE_INT32: 4,
    TYPE_FLOAT32: 4,
    TYPE_BOOL: 1,
    TYPE_UINT64: 8,
    TYPE_INT64: 8,
    TYPE_FLOAT64: 8,
}


def read_exact(handle, size: int) -> bytes:
    data = handle.read(size)
    if len(data) != size:
        raise EOFError(f"expected {size} bytes, got {len(data)}")
    return data


def read_u32(handle) -> int:
    return struct.unpack("<I", read_exact(handle, 4))[0]


def read_u64(handle) -> int:
    return struct.unpack("<Q", read_exact(handle, 8))[0]


def read_string_raw(handle) -> bytes:
    size_raw = read_exact(handle, 8)
    size = struct.unpack("<Q", size_raw)[0]
    return size_raw + read_exact(handle, size)


def raw_string_value(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return struct.pack("<Q", len(encoded)) + encoded


def skip_value(handle, value_type: int) -> None:
    if value_type == TYPE_STRING:
        size = read_u64(handle)
        handle.seek(size, os.SEEK_CUR)
        return

    if value_type == TYPE_ARRAY:
        element_type = read_u32(handle)
        length = read_u64(handle)
        if element_type == TYPE_STRING:
            for _ in range(length):
                size = read_u64(handle)
                handle.seek(size, os.SEEK_CUR)
            return

        if element_type not in SCALAR_SIZES:
            raise ValueError(f"unsupported GGUF array element type {element_type}")

        handle.seek(SCALAR_SIZES[element_type] * length, os.SEEK_CUR)
        return

    if value_type not in SCALAR_SIZES:
        raise ValueError(f"unsupported GGUF value type {value_type}")

    handle.seek(SCALAR_SIZES[value_type], os.SEEK_CUR)


def align(position: int, alignment: int) -> int:
    return position + ((alignment - (position % alignment)) % alignment)


def patch_chat_template(source: Path, template: Path, output: Path) -> None:
    replacement = template.read_text(encoding="utf-8")
    if "result_ns" in replacement:
        raise ValueError("replacement template still contains result_ns")

    with source.open("rb") as src:
        magic = read_exact(src, 4)
        if magic != b"GGUF":
            raise ValueError(f"{source} is not a GGUF file")

        version = read_u32(src)
        tensor_count = read_u64(src)
        kv_count = read_u64(src)

        header = magic + struct.pack("<IQQ", version, tensor_count, kv_count)
        metadata = bytearray()
        found_template = False
        alignment = 32

        for _ in range(kv_count):
            key_raw = read_string_raw(src)
            key = key_raw[8:].decode("utf-8")
            type_raw = read_exact(src, 4)
            value_type = struct.unpack("<I", type_raw)[0]
            value_start = src.tell()
            skip_value(src, value_type)
            value_raw = None

            if key == "tokenizer.chat_template":
                if value_type != TYPE_STRING:
                    raise ValueError("tokenizer.chat_template is not a GGUF string")
                value_raw = raw_string_value(replacement)
                found_template = True
            elif key == "general.alignment":
                src.seek(value_start)
                if value_type == TYPE_UINT32:
                    alignment = read_u32(src)
                elif value_type == TYPE_UINT64:
                    alignment = read_u64(src)
                src.seek(value_start)

            if value_raw is None:
                src.seek(value_start)
                value_raw = read_exact(src, src.tell() * 0)  # keep type checkers simple
                src.seek(value_start)
                skip_value(src, value_type)
                value_end = src.tell()
                src.seek(value_start)
                value_raw = read_exact(src, value_end - value_start)

            metadata.extend(key_raw)
            metadata.extend(type_raw)
            metadata.extend(value_raw)

        if not found_template:
            raise ValueError("tokenizer.chat_template was not found")

        tensor_info_start = src.tell()
        for _ in range(tensor_count):
            _ = read_string_raw(src)
            dimensions = read_u32(src)
            src.seek(8 * dimensions + 4 + 8, os.SEEK_CUR)
        tensor_info_end = src.tell()

        src.seek(tensor_info_start)
        tensor_infos = read_exact(src, tensor_info_end - tensor_info_start)

        old_data_start = align(tensor_info_end, alignment)
        src.seek(old_data_start)

        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("wb") as dst:
            dst.write(header)
            dst.write(metadata)
            dst.write(tensor_infos)
            new_data_start = align(dst.tell(), alignment)
            dst.write(b"\0" * (new_data_start - dst.tell()))

            while True:
                chunk = src.read(1024 * 1024 * 64)
                if not chunk:
                    break
                dst.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    patch_chat_template(args.source, args.template, args.output)


if __name__ == "__main__":
    main()
