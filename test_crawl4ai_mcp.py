#!/usr/bin/env python3
"""
测试爬虫功能的简单脚本
"""

import json
import asyncio
import sys
from enum import Enum, auto

# 导入需要测试的函数
from crawl4ai_mcp.utils import (
    crawl_webpage_impl,
    crawl_website_impl,
    extract_structured_data_impl,
    save_as_markdown_impl
)

# 模拟CacheMode枚举


class CacheMode(Enum):
    DEFAULT = auto()
    BYPASS = auto()
    FORCE = auto()


async def test_crawl_webpage():
    """测试爬取单个网页"""
    print("\n=== 测试爬取单个网页 ===")
    url = "https://www.anthropic.com/engineering/building-effective-agents"
    result_json = await crawl_webpage_impl(url, True, CacheMode.BYPASS)
    result = json.loads(result_json)

    if result.get("success", False):
        print(f"网页爬取成功: {url}")
        print(f"标题: {result.get('title', '')}")
        print(f"内容长度: {len(result.get('markdown', ''))}")
        print(f"单词数量: {result.get('word_count', 0)}")

        # 显示部分内容
        content = result.get('markdown', '')
        preview = content[:500] + "..." if len(content) > 500 else content
        print(f"\n内容预览:\n{preview}")
    else:
        print(f"网页爬取失败: {result.get('error', '未知错误')}")


async def test_crawl_website():
    """测试爬取网站"""
    print("\n=== 测试爬取网站 ===")
    url = "https://www.anthropic.com/engineering"
    max_depth = 1
    max_pages = 2
    result_json = await crawl_website_impl(url, max_depth, max_pages, True)
    result = json.loads(result_json)

    if result.get("success", False):
        print(f"网站爬取成功: {url}")
        pages = result.get("pages", [])
        print(f"爬取页面数量: {len(pages)}")

        for i, page in enumerate(pages[:3], 1):  # 只显示前3个页面
            print(f"\n页面 {i}:")
            print(f"  URL: {page.get('url', '')}")
            print(f"  标题: {page.get('title', '')}")
            print(f"  单词数量: {page.get('word_count', 0)}")
    else:
        print(f"网站爬取失败: {result.get('error', '未知错误')}")


async def test_extract_structured_data():
    """测试提取结构化数据"""
    print("\n=== 测试提取结构化数据 ===")
    url = "https://www.anthropic.com/engineering/building-effective-agents"

    # 定义Schema
    schema = {
        "name": "ArticleInfo",
        "baseSelector": "main",
        "fields": [
            {"name": "title", "selector": "h1", "type": "text"},
            {"name": "content_blocks", "selector": "p",
                "type": "text", "multiple": True},
            {"name": "links", "selector": "a", "type": "attribute",
                "attribute": "href", "multiple": True}
        ]
    }

    result_json = await extract_structured_data_impl(url, schema, "main")
    result = json.loads(result_json)

    if result.get("success", False):
        print(f"结构化数据提取成功: {url}")
        data = result.get("data", {})
        print(
            f"提取的数据: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}...")
    else:
        print(f"结构化数据提取失败: {result.get('error', '未知错误')}")


async def test_save_as_markdown():
    """测试保存为Markdown"""
    print("\n=== 测试保存为Markdown ===")
    url = "https://www.anthropic.com/engineering/building-effective-agents"
    filename = "test_output.md"

    result_json = await save_as_markdown_impl(url, filename, True)
    result = json.loads(result_json)

    if result.get("success", False):
        print(f"保存为Markdown成功: {url}")
        print(f"文件名: {result.get('filename', '')}")
        print(f"单词数量: {result.get('word_count', 0)}")

        # 显示文件内容预览
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
                preview = content[:500] + \
                    "..." if len(content) > 500 else content
                print(f"\n文件内容预览:\n{preview}")
        except Exception as e:
            print(f"读取文件失败: {str(e)}")
    else:
        print(f"保存为Markdown失败: {result.get('error', '未知错误')}")


async def main():
    """主函数"""
    # 显示测试开始
    print("=== 开始测试爬虫功能 ===")
    print(f"Python版本: {sys.version}")

    try:
        # 运行测试
        await test_crawl_webpage()
        await test_crawl_website()
        await test_extract_structured_data()
        await test_save_as_markdown()

    except Exception as e:
        print(f"测试过程中出错: {str(e)}")

    print("\n=== 测试完成 ===")

if __name__ == "__main__":
    # 运行主函数
    asyncio.run(main())
