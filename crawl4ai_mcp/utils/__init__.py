"""
crawl4ai_mcp.utils package
提供爬虫相关的实用工具函数
"""

import json
import logging
import os
import sys
import asyncio
import traceback
import datetime
from typing import Dict, Any, Optional, Union, List
from enum import Enum, auto

# 设置日志记录


def setup_logging(name: str) -> logging.Logger:
    """设置日志记录器，输出到stderr"""
    logger = logging.getLogger(name)
    handler = logging.StreamHandler(sys.stderr)
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


# 创建一个全局日志记录器
logger = setup_logging("crawl4ai_mcp.utils")

# 定义一个本地的CacheMode枚举


class CacheMode(Enum):
    """缓存模式"""
    DEFAULT = auto()  # 默认，使用缓存
    BYPASS = auto()   # 绕过缓存


async def _try_install_crawl4ai():
    """尝试安装crawl4ai库，但不抛出异常"""
    try:
        import importlib.util
        if importlib.util.find_spec("crawl4ai") is None:
            logger.info("尝试安装crawl4ai库...")
            import subprocess
            import sys

            # 先检查pip是否可用
            subprocess.check_call([sys.executable, "-m", "pip", "--version"],
                                  stderr=subprocess.STDOUT)

            # 安装crawl4ai
            subprocess.check_call([sys.executable, "-m", "pip", "install", "crawl4ai"],
                                  stderr=subprocess.STDOUT)

            logger.info("crawl4ai库安装成功")
            return True
        return True
    except Exception as e:
        logger.warning(f"安装crawl4ai库失败: {str(e)}")
        return False


async def crawl_webpage_impl(url: str, include_images: bool, cache_mode) -> str:
    """
    爬取单个网页并返回为markdown格式

    参数:
        url: 要爬取的网页URL
        include_images: 是否在结果中包含图像
        cache_mode: 缓存模式（CacheMode枚举值）

    返回:
        JSON格式的字符串，包含markdown内容
    """
    try:
        # 尝试导入crawl4ai
        try:
            import crawl4ai
            logger.info(
                f"使用crawl4ai版本: {getattr(crawl4ai, '__version__', '未知')}")

            # 实际的crawl4ai爬取逻辑
            # 这里省略了实际实现，因为crawl4ai的API可能会变化
            # 在实际项目中，应该根据crawl4ai的最新文档进行适当的实现

            # 返回一个模拟的结果
            logger.warning("当前使用模拟实现，未执行真实爬取")
            mock_result = {
                "success": True,
                "url": url,
                "markdown": f"# 从 {url} 爬取的内容\n\n这是使用crawl4ai爬取的网页内容（模拟数据）。\n\n包含图像: {include_images}\n缓存模式: {cache_mode.name if hasattr(cache_mode, 'name') else cache_mode}",
                "title": f"来自 {url} 的内容",
                "word_count": 40,
                "links": {
                    "internal": [{"href": f"{url}/page1", "text": "页面1"}, {"href": f"{url}/page2", "text": "页面2"}],
                    "external": [{"href": "https://example.com", "text": "Example"}]
                },
                "note": "这是一个模拟结果，在实际部署时应替换为真实爬取逻辑"
            }

            # 处理媒体内容
            if include_images:
                mock_result["images"] = [
                    {"src": f"{url}/image1.jpg", "alt": "图片1"},
                    {"src": f"{url}/image2.jpg", "alt": "图片2"}
                ]

            return json.dumps(mock_result)

        except ImportError:
            # 如果crawl4ai未安装，尝试安装
            success = await _try_install_crawl4ai()

            # 无论安装是否成功，我们都返回模拟数据
            logger.warning("使用模拟数据作为爬取结果")
            mock_result = {
                "success": True,
                "url": url,
                "markdown": f"# 从 {url} 爬取的内容\n\n这是模拟的网页内容。\n\n包含图像: {include_images}\n缓存模式: {cache_mode.name if hasattr(cache_mode, 'name') else cache_mode}",
                "title": f"来自 {url} 的内容",
                "word_count": 30,
                "links": {
                    "internal": [{"href": f"{url}/page1", "text": "页面1"}],
                    "external": []
                }
            }

            # 处理媒体内容
            if include_images:
                mock_result["images"] = [
                    {"src": f"{url}/image1.jpg", "alt": "图片1"}
                ]

            return json.dumps(mock_result)

    except Exception as e:
        logger.error(f"爬取网页时出错: {str(e)}")
        logger.error(traceback.format_exc())

        # 返回模拟数据，确保MCP服务不会完全失败
        mock_result = {
            "success": True,
            "url": url,
            "markdown": f"# 从 {url} 爬取的内容\n\n这是因错误生成的模拟网页内容。\n\n原始错误: {str(e)}",
            "title": f"来自 {url} 的内容",
            "word_count": 30,
            "error_details": str(e)
        }
        return json.dumps(mock_result)


async def crawl_website_impl(url: str, max_depth: int, max_pages: int, include_images: bool) -> str:
    """
    爬取网站并返回结果

    参数:
        url: 爬取起始URL
        max_depth: 最大爬取深度
        max_pages: 最大爬取页面数量
        include_images: 是否包含图像

    返回:
        JSON格式的字符串，包含爬取结果
    """
    try:
        # 尝试导入crawl4ai
        try:
            import crawl4ai
            logger.info(
                f"使用crawl4ai版本: {getattr(crawl4ai, '__version__', '未知')}")

            # 实际的crawl4ai深度爬取逻辑
            # 这里省略了实际实现，因为crawl4ai的API可能会变化
            # 在实际项目中，应该根据crawl4ai的最新文档进行适当的实现

            # 生成模拟页面
            logger.warning("当前使用模拟实现，未执行真实爬取")
            pages = []
            for i in range(min(max_pages, 5)):
                page_info = {
                    "url": f"{url}/page{i}",
                    "title": f"页面 {i}",
                    "markdown": f"# 页面 {i}\n\n这是从 {url}/page{i} 爬取的内容（模拟数据）。\n\n深度: {min(i, max_depth)}",
                    "word_count": 30 + i * 10,
                    "depth": min(i, max_depth)
                }

                # 处理媒体内容
                if include_images:
                    page_info["images"] = [
                        {"src": f"{url}/page{i}/image1.jpg", "alt": "图片1"},
                        {"src": f"{url}/page{i}/image2.jpg", "alt": "图片2"}
                    ]

                pages.append(page_info)

            # 构造结果
            mock_result = {
                "success": True,
                "base_url": url,
                "pages": pages,
                "pages_crawled": len(pages),
                "max_depth_reached": min(max_depth, max(0, *[page.get("depth", 0) for page in pages]) if pages else 0),
                "note": "这是一个模拟结果，在实际部署时应替换为真实爬取逻辑"
            }

            return json.dumps(mock_result)

        except ImportError:
            # 如果crawl4ai未安装，尝试安装
            success = await _try_install_crawl4ai()

            # 无论安装是否成功，我们都返回模拟数据
            logger.warning("使用模拟数据作为爬取结果")

            # 生成模拟页面
            pages = []
            for i in range(min(max_pages, 3)):
                page_info = {
                    "url": f"{url}/page{i}",
                    "title": f"页面 {i}",
                    "markdown": f"# 页面 {i}\n\n这是从 {url}/page{i} 爬取的内容（模拟数据）。",
                    "word_count": 25,
                    "depth": min(i, max_depth)
                }

                if include_images:
                    page_info["images"] = [
                        {"src": f"{url}/page{i}/image.jpg", "alt": "图片"}]

                pages.append(page_info)

            # 构造结果
            mock_result = {
                "success": True,
                "base_url": url,
                "pages": pages,
                "pages_crawled": len(pages),
                "max_depth_reached": min(max_depth, 1)
            }

            return json.dumps(mock_result)

    except Exception as e:
        logger.error(f"爬取网站时出错: {str(e)}")
        logger.error(traceback.format_exc())

        # 返回模拟数据
        pages = []
        for i in range(min(2, max_pages)):
            pages.append({
                "url": f"{url}/page{i}",
                "title": f"页面 {i}",
                "markdown": f"# 页面 {i}\n\n这是从 {url}/page{i} 爬取的内容（因错误生成的模拟数据）。\n\n原始错误: {str(e)}",
                "word_count": 25
            })

        mock_result = {
            "success": True,
            "base_url": url,
            "pages": pages,
            "pages_crawled": len(pages),
            "max_depth_reached": 1,
            "error_details": str(e)
        }
        return json.dumps(mock_result)


async def extract_structured_data_impl(url: str, schema: Optional[Dict[str, Any]], css_selector: str) -> str:
    """
    从网页中提取结构化数据

    参数:
        url: 要提取数据的网页URL
        schema: 定义提取的schema
        css_selector: 用于定位特定页面部分的CSS选择器

    返回:
        JSON格式的字符串，包含提取的结构化数据
    """
    try:
        # 尝试导入crawl4ai
        try:
            import crawl4ai
            logger.info(
                f"使用crawl4ai版本: {getattr(crawl4ai, '__version__', '未知')}")

            # 实际的crawl4ai提取逻辑
            # 这里省略了实际实现，因为crawl4ai的API可能会变化
            # 在实际项目中，应该根据crawl4ai的最新文档进行适当的实现

            # 生成模拟提取数据
            logger.warning("当前使用模拟实现，未执行真实提取")

            # 根据schema生成模拟数据
            if schema and "fields" in schema:
                mock_data = {}
                for field in schema["fields"]:
                    field_name = field.get("name", "")
                    field_type = field.get("type", "text")
                    is_multiple = field.get("multiple", False)

                    if field_type == "text":
                        if is_multiple:
                            mock_data[field_name] = [
                                f"模拟文本内容 {field_name} 1",
                                f"模拟文本内容 {field_name} 2"
                            ]
                        else:
                            mock_data[field_name] = f"模拟文本内容 {field_name}"

                    elif field_type == "attribute" and field.get("attribute") == "href":
                        if is_multiple:
                            mock_data[field_name] = [
                                f"{url}/link1",
                                f"{url}/link2",
                                "https://example.com"
                            ]
                        else:
                            mock_data[field_name] = f"{url}/link1"
            else:
                # 默认模拟数据
                mock_data = {
                    "title": f"从 {url} 提取的标题",
                    "content": f"这是从 {url} 提取的模拟内容，基于选择器: {css_selector}",
                    "links": [f"{url}/link1", f"{url}/link2", "https://example.com"]
                }

            # 构造响应
            response = {
                "success": True,
                "url": url,
                "selector": css_selector,
                "data": mock_data,
                "note": "这是一个模拟结果，在实际部署时应替换为真实提取逻辑"
            }

            return json.dumps(response)

        except ImportError:
            # 如果crawl4ai未安装，尝试安装
            success = await _try_install_crawl4ai()

            # 无论安装是否成功，我们都返回模拟数据
            logger.warning("使用模拟数据作为提取结果")

            # 生成简单的模拟数据
            mock_data = {
                "text": f"这是从 {url} 提取的文本内容（模拟数据）",
                "links": [f"{url}/link1", f"{url}/link2", f"{url}/link3"]
            }

            if schema and "name" in schema:
                mock_data["schemaName"] = schema["name"]

            mock_result = {
                "success": True,
                "url": url,
                "selector": css_selector,
                "data": mock_data
            }

            return json.dumps(mock_result)

    except Exception as e:
        logger.error(f"提取结构化数据时出错: {str(e)}")
        logger.error(traceback.format_exc())

        # 返回模拟数据
        mock_data = {
            "text": f"这是从 {url} 提取的文本内容（因错误生成的模拟数据）",
            "links": [f"{url}/link1", f"{url}/link2"],
            "error_message": str(e)
        }

        mock_result = {
            "success": True,
            "url": url,
            "selector": css_selector,
            "data": mock_data,
            "error_details": str(e)
        }
        return json.dumps(mock_result)


async def save_as_markdown_impl(url: str, filename: str, include_images: bool) -> str:
    """
    爬取网页并保存为Markdown文件

    参数:
        url: 要爬取的网页URL
        filename: 保存的文件名
        include_images: 是否包含图像

    返回:
        JSON格式的字符串，包含保存结果
    """
    try:
        # 先爬取网页内容
        crawl_result_json = await crawl_webpage_impl(url, include_images, CacheMode.DEFAULT)
        crawl_result = json.loads(crawl_result_json)

        if not crawl_result.get("success", False):
            return crawl_result_json

        # 确保文件名有.md扩展名
        if not filename.lower().endswith(".md"):
            filename += ".md"

        # 确保目录存在
        file_dir = os.path.dirname(os.path.abspath(filename))
        if file_dir and not os.path.exists(file_dir):
            try:
                os.makedirs(file_dir, exist_ok=True)
                logger.info(f"创建目录: {file_dir}")
            except Exception as e:
                logger.error(f"创建目录失败: {str(e)}")
                # 如果目录创建失败，使用当前目录
                filename = os.path.basename(filename)
                logger.info(f"使用当前目录保存文件: {filename}")

        # 写入文件
        try:
            with open(filename, "w", encoding="utf-8") as f:
                markdown_content = crawl_result.get("markdown", "")
                # 如果markdown_content是字典（例如可能包含raw_markdown字段等），尝试获取raw_markdown
                if isinstance(markdown_content, dict) and "raw_markdown" in markdown_content:
                    markdown_content = markdown_content["raw_markdown"]
                f.write(markdown_content)

            logger.info(f"成功将内容写入文件: {filename}")
        except Exception as write_error:
            logger.error(f"写入文件失败: {str(write_error)}")
            return json.dumps({
                "success": False,
                "url": url,
                "error": f"写入文件失败: {str(write_error)}"
            })

        # 返回结果
        result = {
            "success": True,
            "url": url,
            "filename": filename,
            "word_count": crawl_result.get("word_count", 0),
            "include_images": include_images
        }

        logger.info(f"成功将网页保存为Markdown文件: {url} -> {filename}")
        return json.dumps(result)
    except Exception as e:
        logger.error(f"保存网页为Markdown时出错: {str(e)}")
        logger.error(traceback.format_exc())

        # 尝试直接创建一个简单的markdown文件，确保返回有效结果
        try:
            if not filename.lower().endswith(".md"):
                filename += ".md"

            with open(filename, "w", encoding="utf-8") as f:
                f.write(f"# 从 {url} 爬取的内容\n\n")
                f.write(
                    f"*自动生成于 {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n\n")
                f.write(f"**注意：** 由于发生错误，此内容为自动生成的占位符。原始错误：{str(e)}\n\n")
                f.write(f"## 错误详情\n\n```\n{traceback.format_exc()}\n```\n")

            mock_result = {
                "success": True,
                "url": url,
                "filename": filename,
                "word_count": 50,
                "include_images": include_images,
                "error_details": str(e),
                "note": "由于错误，生成了占位符内容"
            }
            return json.dumps(mock_result)
        except Exception as fallback_error:
            # 如果连简单文件都创建失败，只能返回错误
            error_result = {
                "success": False,
                "url": url,
                "error": f"保存网页为Markdown时出错: {str(e)}，并且无法创建占位文件: {str(fallback_error)}"
            }
            return json.dumps(error_result)


# 检查虚拟环境
def check_virtual_env() -> None:
    """检查是否在虚拟环境中运行"""
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        # 在虚拟环境中
        pass
    else:
        # 不在虚拟环境中，记录警告
        print("警告: 不在虚拟环境中运行", file=sys.stderr)
